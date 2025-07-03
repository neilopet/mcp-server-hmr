/**
 * Request Logger Extension for mcpmon
 *
 * A simple example extension that logs all MCP requests and responses.
 * Useful for debugging, monitoring, and understanding MCP protocol flow.
 */
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
const DEFAULT_CONFIG = {
    logLevel: 'info',
    includeHeaders: true,
    includeBody: true,
    saveToFile: false,
    maxFileSize: '10MB',
    maxFiles: 5,
    logFormat: 'pretty',
};
export class RequestLoggerExtension {
    id = 'request-logger';
    name = 'Request Logger';
    version = '1.0.0';
    defaultEnabled = false;
    config = DEFAULT_CONFIG;
    logger;
    logFile;
    requestCount = 0;
    responseCount = 0;
    errorCount = 0;
    startTime = Date.now();
    async initialize(context) {
        this.config = { ...DEFAULT_CONFIG, ...context.config };
        this.logger = context.logger;
        // Setup file logging if enabled
        if (this.config.saveToFile) {
            this.logFile = join(context.dataDir, 'requests.log');
            await mkdir(dirname(this.logFile), { recursive: true });
        }
        // Register hooks
        context.hooks.beforeStdinForward = this.logRequest.bind(this);
        context.hooks.afterStdoutReceive = this.logResponse.bind(this);
        context.hooks.onShutdown = this.logSummary.bind(this);
        this.log('info', `Request Logger initialized with config:`, this.config);
    }
    async shutdown() {
        await this.logSummary();
        this.log('info', 'Request Logger shut down');
    }
    /**
     * Log incoming requests (client -> server)
     */
    async logRequest(message) {
        this.requestCount++;
        // Filter by method if configured
        if (this.config.filterMethods && !this.config.filterMethods.includes(message.method)) {
            return message;
        }
        if (this.config.excludeMethods && this.config.excludeMethods.includes(message.method)) {
            return message;
        }
        const logData = {
            type: 'request',
            timestamp: new Date().toISOString(),
            direction: 'client → server',
            id: message.id,
            method: message.method,
            ...(this.config.includeHeaders && {
                jsonrpc: message.jsonrpc,
                headers: this.extractHeaders(message)
            }),
            ...(this.config.includeBody && {
                params: message.params
            }),
        };
        await this.writeLog(logData, 'REQUEST');
        return message;
    }
    /**
     * Log outgoing responses (server -> client)
     */
    async logResponse(message) {
        this.responseCount++;
        const isError = !!message.error;
        if (isError) {
            this.errorCount++;
        }
        const logData = {
            type: 'response',
            timestamp: new Date().toISOString(),
            direction: 'server → client',
            id: message.id,
            success: !isError,
            ...(this.config.includeHeaders && {
                jsonrpc: message.jsonrpc
            }),
            ...(this.config.includeBody && {
                ...(isError ? { error: message.error } : { result: message.result })
            }),
        };
        await this.writeLog(logData, isError ? 'ERROR' : 'RESPONSE');
        return message;
    }
    /**
     * Write log entry to console and/or file
     */
    async writeLog(data, prefix) {
        const logLevel = this.shouldLog(data.success === false ? 'error' : 'info') ?
            (data.success === false ? 'error' : 'info') : null;
        if (!logLevel)
            return;
        if (this.config.logFormat === 'pretty') {
            const formatted = this.formatPrettyLog(data, prefix);
            this.log(logLevel, formatted);
        }
        else {
            this.log(logLevel, `[${prefix}]`, JSON.stringify(data));
        }
        // Write to file if enabled
        if (this.config.saveToFile && this.logFile) {
            try {
                const logLine = JSON.stringify(data) + '\n';
                await writeFile(this.logFile, logLine, { flag: 'a' });
            }
            catch (error) {
                this.log('error', 'Failed to write to log file:', error);
            }
        }
    }
    /**
     * Format log entry in human-readable format
     */
    formatPrettyLog(data, prefix) {
        const parts = [
            `[${prefix}]`,
            `${data.direction}`,
            data.id ? `#${data.id}` : '',
            data.method ? `${data.method}` : '',
        ].filter(Boolean);
        let formatted = parts.join(' ');
        if (data.error) {
            formatted += ` ERROR: ${data.error.message || data.error.code || 'Unknown error'}`;
        }
        else if (data.result && typeof data.result === 'object') {
            const resultSummary = this.summarizeObject(data.result);
            formatted += ` → ${resultSummary}`;
        }
        else if (data.params && typeof data.params === 'object') {
            const paramsSummary = this.summarizeObject(data.params);
            formatted += ` (${paramsSummary})`;
        }
        return formatted;
    }
    /**
     * Create a brief summary of an object for logging
     */
    summarizeObject(obj) {
        if (Array.isArray(obj)) {
            return `[${obj.length} items]`;
        }
        if (typeof obj === 'object' && obj !== null) {
            const keys = Object.keys(obj);
            if (keys.length === 0)
                return '{}';
            if (keys.length === 1)
                return `{${keys[0]}}`;
            return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
        }
        return String(obj);
    }
    /**
     * Extract headers from message (if any)
     */
    extractHeaders(message) {
        const headers = {};
        // Standard JSON-RPC headers
        if (message.jsonrpc)
            headers.jsonrpc = message.jsonrpc;
        // Any custom headers (implementation-specific)
        if (message.headers)
            headers.custom = message.headers;
        return headers;
    }
    /**
     * Check if we should log at the given level
     */
    shouldLog(level) {
        const levels = ['trace', 'debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.config.logLevel);
        const requestedLevelIndex = levels.indexOf(level);
        return requestedLevelIndex >= currentLevelIndex;
    }
    /**
     * Write log message using configured logger
     */
    log(level, message, ...args) {
        if (!this.logger || !this.shouldLog(level))
            return;
        const prefixedMessage = `🔍 ${message}`;
        this.logger[level](prefixedMessage, ...args);
    }
    /**
     * Log summary statistics
     */
    async logSummary() {
        const runtime = Date.now() - this.startTime;
        const runtimeSeconds = Math.round(runtime / 1000);
        const summary = {
            runtime: `${runtimeSeconds}s`,
            totalRequests: this.requestCount,
            totalResponses: this.responseCount,
            errors: this.errorCount,
            successRate: this.responseCount > 0 ?
                `${Math.round(((this.responseCount - this.errorCount) / this.responseCount) * 100)}%` :
                'N/A',
            avgRequestsPerSecond: runtimeSeconds > 0 ?
                Math.round(this.requestCount / runtimeSeconds) : 0,
        };
        this.log('info', 'Request Logger Summary:', summary);
        if (this.config.saveToFile && this.logFile) {
            const summaryLine = JSON.stringify({
                type: 'summary',
                timestamp: new Date().toISOString(),
                ...summary
            }) + '\n';
            try {
                await writeFile(this.logFile, summaryLine, { flag: 'a' });
            }
            catch (error) {
                this.log('error', 'Failed to write summary to log file:', error);
            }
        }
    }
}
// Export singleton instance
export default new RequestLoggerExtension();
