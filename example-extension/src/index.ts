/**
 * RequestLoggerExtension - A comprehensive MCP extension for logging requests and responses
 */

import { 
  Extension, 
  ExtensionContext, 
  MCPMessage, 
  Tool, 
  ToolInput, 
  ToolOutput 
} from 'mcpmon';
import { RequestLogger } from './logger.ts';
import { RequestLoggerConfig, defaultConfig, validateConfig } from './config.ts';

export class RequestLoggerExtension implements Extension {
  name = 'request-logger';
  version = '1.0.0';
  description = 'Logs MCP requests and responses with comprehensive analytics';

  private logger: RequestLogger;
  private config: RequestLoggerConfig;

  constructor(config: Partial<RequestLoggerConfig> = {}) {
    this.config = validateConfig(config);
    this.logger = new RequestLogger(this.config);
  }

  async initialize(context: ExtensionContext): Promise<void> {
    // Register tools
    context.registerTool(this.createGetRequestLogsTool());
    context.registerTool(this.createClearRequestLogsTool());
    context.registerTool(this.createGetRequestStatsTool());

    // Register hooks
    context.onBeforeStdinForward(this.handleBeforeStdinForward.bind(this));
    context.onAfterStdoutReceive(this.handleAfterStdoutReceive.bind(this));

    console.log(`RequestLoggerExtension initialized with config:`, {
      maxRequests: this.config.maxRequests,
      logLevel: this.config.logLevel,
      logFilePath: this.config.logFilePath,
    });
  }

  private async handleBeforeStdinForward(message: MCPMessage): Promise<MCPMessage> {
    // Log outgoing requests
    if (message.id && message.method) {
      this.logger.logRequest(
        message.id.toString(),
        message.method,
        message.params
      );
    }
    
    return message; // Pass through unchanged
  }

  private async handleAfterStdoutReceive(message: MCPMessage): Promise<MCPMessage> {
    // Log incoming responses
    if (message.id) {
      this.logger.logResponse(
        message.id.toString(),
        message.result,
        message.error
      );
    }
    
    return message; // Pass through unchanged
  }

  private createGetRequestLogsTool(): Tool {
    return {
      name: 'get_request_logs',
      description: 'Retrieve logged MCP requests and responses',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of log entries to return',
            default: 50
          },
          direction: {
            type: 'string',
            enum: ['request', 'response', 'both'],
            description: 'Filter by request/response direction',
            default: 'both'
          },
          method: {
            type: 'string',
            description: 'Filter by specific method name'
          }
        }
      },
      handler: async (input: ToolInput): Promise<ToolOutput> => {
        const { limit = 50, direction = 'both', method } = input;
        
        let logs = this.logger.getLogs();
        
        // Apply filters
        if (direction !== 'both') {
          logs = logs.filter(log => log.direction === direction);
        }
        
        if (method) {
          logs = logs.filter(log => log.method === method);
        }
        
        // Apply limit
        logs = logs.slice(-limit);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              logs,
              totalCount: logs.length,
              filters: { limit, direction, method }
            }, null, 2)
          }]
        };
      }
    };
  }

  private createClearRequestLogsTool(): Tool {
    return {
      name: 'clear_request_logs',
      description: 'Clear all logged requests and responses',
      inputSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Confirmation flag to prevent accidental clearing',
            default: false
          }
        }
      },
      handler: async (input: ToolInput): Promise<ToolOutput> => {
        const { confirm = false } = input;
        
        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: 'Please set confirm=true to clear request logs'
            }]
          };
        }
        
        const logCount = this.logger.getLogs().length;
        this.logger.clear();
        
        return {
          content: [{
            type: 'text',
            text: `Cleared ${logCount} request log entries`
          }]
        };
      }
    };
  }

  private createGetRequestStatsTool(): Tool {
    return {
      name: 'get_request_stats',
      description: 'Get statistics about logged MCP requests',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async (input: ToolInput): Promise<ToolOutput> => {
        const stats = this.logger.getStats();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      }
    };
  }

  async cleanup(): Promise<void> {
    console.log('RequestLoggerExtension cleanup completed');
  }
}

// Export for third-party usage
export default RequestLoggerExtension;
export { RequestLoggerConfig, defaultConfig, validateConfig } from './config.ts';
export { RequestLogger, RequestLogEntry, RequestStats } from './logger.ts';