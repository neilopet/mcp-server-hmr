/**
 * Request Logger Extension for mcpmon
 *
 * A simple example extension that logs all MCP requests and responses.
 * Useful for debugging, monitoring, and understanding MCP protocol flow.
 */
import type { Extension, ExtensionContext } from '../interfaces.js';
export declare class RequestLoggerExtension implements Extension {
    readonly id = "request-logger";
    readonly name = "Request Logger";
    readonly version = "1.0.0";
    readonly defaultEnabled = false;
    private config;
    private logger?;
    private logFile?;
    private requestCount;
    private responseCount;
    private errorCount;
    private startTime;
    initialize(context: ExtensionContext): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Log incoming requests (client -> server)
     */
    private logRequest;
    /**
     * Log outgoing responses (server -> client)
     */
    private logResponse;
    /**
     * Write log entry to console and/or file
     */
    private writeLog;
    /**
     * Format log entry in human-readable format
     */
    private formatPrettyLog;
    /**
     * Create a brief summary of an object for logging
     */
    private summarizeObject;
    /**
     * Extract headers from message (if any)
     */
    private extractHeaders;
    /**
     * Check if we should log at the given level
     */
    private shouldLog;
    /**
     * Write log message using configured logger
     */
    private log;
    /**
     * Log summary statistics
     */
    private logSummary;
}
declare const _default: RequestLoggerExtension;
export default _default;
//# sourceMappingURL=index.d.ts.map