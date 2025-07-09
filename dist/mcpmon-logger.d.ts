/**
 * MCPMon Logger for sending structured notifications to MCP clients
 *
 * This logger sends MCP-formatted notification messages through stdout,
 * respecting client logging levels to avoid flooding.
 */
/**
 * Logging levels following standard severity hierarchy
 */
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
/**
 * Logger class for sending MCP-formatted notifications
 */
export declare class MCPMonLogger {
    private stdout;
    private getLevel;
    private encoder;
    private writeQueue;
    /**
     * Creates a new MCPMonLogger instance
     *
     * @param stdout - WritableStream for sending notifications
     * @param getLevel - Callback to get current client logging level
     */
    constructor(stdout: WritableStream<Uint8Array>, getLevel: () => string);
    /**
     * Internal method to send log messages if they meet the severity threshold
     *
     * @param level - Severity level of the message
     * @param message - Log message text
     * @param data - Optional additional data to include
     */
    private log;
    /**
     * Log a debug message
     */
    debug(message: string, data?: any): Promise<void>;
    /**
     * Log an info message
     */
    info(message: string, data?: any): Promise<void>;
    /**
     * Log a notice message
     */
    notice(message: string, data?: any): Promise<void>;
    /**
     * Log a warning message
     */
    warning(message: string, data?: any): Promise<void>;
    /**
     * Log an error message
     */
    error(message: string, data?: any): Promise<void>;
    /**
     * Log a critical message
     */
    critical(message: string, data?: any): Promise<void>;
    /**
     * Log an alert message
     */
    alert(message: string, data?: any): Promise<void>;
    /**
     * Log an emergency message
     */
    emergency(message: string, data?: any): Promise<void>;
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
export declare function createMCPMonLogger(stdout: WritableStream<Uint8Array>, getLevel: () => string): MCPMonLogger;
//# sourceMappingURL=mcpmon-logger.d.ts.map