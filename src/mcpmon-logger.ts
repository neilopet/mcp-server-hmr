/**
 * MCPMon Logger for sending structured notifications to MCP clients
 * 
 * This logger sends MCP-formatted notification messages through stdout,
 * respecting client logging levels to avoid flooding.
 */

/**
 * Logging levels following standard severity hierarchy
 */
export type LogLevel = 
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

/**
 * Numeric severity values for log levels (higher = more severe)
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
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
  private stdout: WritableStream<Uint8Array>;
  private getLevel: () => string;
  private encoder = new TextEncoder();
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Creates a new MCPMonLogger instance
   * 
   * @param stdout - WritableStream for sending notifications
   * @param getLevel - Callback to get current client logging level
   */
  constructor(stdout: WritableStream<Uint8Array>, getLevel: () => string) {
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
  private async log(level: LogLevel, message: string, data?: any): Promise<void> {
    const clientLevel = this.getLevel().toLowerCase() as LogLevel;
    
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
      } finally {
        writer.releaseLock();
      }
    }).catch(error => {
      // Log errors to stderr instead of throwing
      console.error('MCPMonLogger write error:', error);
    });
    
    // Wait for the write to complete before returning
    await this.writeQueue;
  }

  /**
   * Log a debug message
   */
  async debug(message: string, data?: any): Promise<void> {
    await this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  async info(message: string, data?: any): Promise<void> {
    await this.log('info', message, data);
  }

  /**
   * Log a notice message
   */
  async notice(message: string, data?: any): Promise<void> {
    await this.log('notice', message, data);
  }

  /**
   * Log a warning message
   */
  async warning(message: string, data?: any): Promise<void> {
    await this.log('warning', message, data);
  }

  /**
   * Log an error message
   */
  async error(message: string, data?: any): Promise<void> {
    await this.log('error', message, data);
  }

  /**
   * Log a critical message
   */
  async critical(message: string, data?: any): Promise<void> {
    await this.log('critical', message, data);
  }

  /**
   * Log an alert message
   */
  async alert(message: string, data?: any): Promise<void> {
    await this.log('alert', message, data);
  }

  /**
   * Log an emergency message
   */
  async emergency(message: string, data?: any): Promise<void> {
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
export function createMCPMonLogger(
  stdout: WritableStream<Uint8Array>,
  getLevel: () => string
): MCPMonLogger {
  return new MCPMonLogger(stdout, getLevel);
}