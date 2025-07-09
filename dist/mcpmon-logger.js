/**
 * MCPMon Logger for sending structured notifications to MCP clients
 *
 * This logger sends MCP-formatted notification messages through stdout,
 * respecting client logging levels to avoid flooding.
 */
/**
 * Numeric severity values for log levels (higher = more severe)
 */
const LOG_LEVEL_VALUES = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    error: 4,
    critical: 5,
    alert: 6,
    emergency: 7,
};
/**
 * Logger class for sending MCP-formatted notifications
 */
export class MCPMonLogger {
    stdout;
    getLevel;
    encoder = new TextEncoder();
    writeQueue = Promise.resolve();
    /**
     * Creates a new MCPMonLogger instance
     *
     * @param stdout - WritableStream for sending notifications
     * @param getLevel - Callback to get current client logging level
     */
    constructor(stdout, getLevel) {
        this.stdout = stdout;
        this.getLevel = getLevel;
    }
    /**
     * Internal method to send log messages if they meet the severity threshold
     *
     * @param level - Severity level of the message
     * @param message - Log message text
     * @param data - Optional additional data to include
     */
    async log(level, message, data) {
        const clientLevel = this.getLevel().toLowerCase();
        // Check if this message meets the severity threshold
        const clientLevelValue = LOG_LEVEL_VALUES[clientLevel] ?? LOG_LEVEL_VALUES.info;
        const messageLevelValue = LOG_LEVEL_VALUES[level];
        if (messageLevelValue < clientLevelValue) {
            return; // Don't send messages below client's threshold
        }
        // Construct MCP notification message
        const notification = {
            jsonrpc: "2.0",
            method: "notifications/message",
            params: {
                level,
                logger: "mcpmon",
                data: {
                    message,
                    ...data
                }
            }
        };
        // Queue the write operation to avoid concurrent access
        this.writeQueue = this.writeQueue.then(async () => {
            const writer = this.stdout.getWriter();
            try {
                const messageText = JSON.stringify(notification) + '\n';
                await writer.write(this.encoder.encode(messageText));
            }
            finally {
                writer.releaseLock();
            }
        }).catch(error => {
            // Log errors to stderr instead of throwing
            console.error('MCPMonLogger write error:', error);
        });
    }
    /**
     * Log a debug message
     */
    async debug(message, data) {
        await this.log('debug', message, data);
    }
    /**
     * Log an info message
     */
    async info(message, data) {
        await this.log('info', message, data);
    }
    /**
     * Log a notice message
     */
    async notice(message, data) {
        await this.log('notice', message, data);
    }
    /**
     * Log a warning message
     */
    async warning(message, data) {
        await this.log('warning', message, data);
    }
    /**
     * Log an error message
     */
    async error(message, data) {
        await this.log('error', message, data);
    }
    /**
     * Log a critical message
     */
    async critical(message, data) {
        await this.log('critical', message, data);
    }
    /**
     * Log an alert message
     */
    async alert(message, data) {
        await this.log('alert', message, data);
    }
    /**
     * Log an emergency message
     */
    async emergency(message, data) {
        await this.log('emergency', message, data);
    }
}
/**
 * Factory function to create a new MCPMonLogger instance
 *
 * @param stdout - WritableStream for sending notifications
 * @param getLevel - Callback to get current client logging level
 * @returns New MCPMonLogger instance
 *
 * @example
 * ```typescript
 * const logger = createMCPMonLogger(stdout, () => 'info');
 * await logger.info('Server started', { port: 3000 });
 * await logger.error('Connection failed', { error: err.message });
 * ```
 */
export function createMCPMonLogger(stdout, getLevel) {
    return new MCPMonLogger(stdout, getLevel);
}
