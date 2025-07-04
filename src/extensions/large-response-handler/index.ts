/**
 * Large Response Handler Extension for mcpmon
 * 
 * Automatically detects and handles MCP tool responses that exceed configurable
 * thresholds by persisting data to disk and providing streaming support.
 */

import type { Extension, ExtensionContext, ToolDefinition } from '../interfaces.js';
import { StreamingBuffer } from './streaming.js';

export interface LargeResponseHandlerConfig {
  threshold: number;  // Response size threshold in bytes
  dataDir: string;  // Directory to store large responses
  enableDuckDB: boolean;  // Enable DuckDB analysis features
  compressionLevel: number;  // Gzip compression level (0-9)
  maxStoredResponses: number;  // Maximum number of stored responses
  retentionDays: number;  // Number of days to retain stored responses
  
  // Streaming configuration
  enableStreaming?: boolean;  // Default: true
  progressUpdateInterval?: number;  // Min ms between progress updates, default: 500
  maxBufferSize?: number;  // Max bytes before disk fallback, default: 100MB
  streamingTimeout?: number;  // Ms before abandoned request cleanup, default: 5 minutes
}

const DEFAULT_CONFIG: LargeResponseHandlerConfig = {
  threshold: 50000,
  dataDir: './data',
  enableDuckDB: true,
  compressionLevel: 6,
  maxStoredResponses: 100,
  retentionDays: 7,
  enableStreaming: true,
  progressUpdateInterval: 500,
  maxBufferSize: 100 * 1024 * 1024,  // 100MB
  streamingTimeout: 5 * 60 * 1000,  // 5 minutes
};

export default class LargeResponseHandlerExtension implements Extension {
  readonly id = 'large-response-handler';
  readonly name = 'Large Response Handler';
  readonly version = '1.0.0';
  readonly defaultEnabled = false;
  
  readonly configSchema = {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        minimum: 1000,
        default: 50000,
        description: 'Response size threshold in bytes'
      },
      dataDir: {
        type: 'string',
        default: './data',
        description: 'Directory to store large responses'
      },
      enableDuckDB: {
        type: 'boolean',
        default: true,
        description: 'Enable DuckDB analysis features'
      },
      compressionLevel: {
        type: 'number',
        minimum: 0,
        maximum: 9,
        default: 6,
        description: 'Gzip compression level (0-9)'
      },
      maxStoredResponses: {
        type: 'number',
        minimum: 1,
        default: 100,
        description: 'Maximum number of stored responses'
      },
      retentionDays: {
        type: 'number',
        minimum: 1,
        default: 7,
        description: 'Number of days to retain stored responses'
      },
      enableStreaming: {
        type: 'boolean',
        default: true,
        description: 'Enable streaming support for large responses'
      },
      progressUpdateInterval: {
        type: 'number',
        minimum: 100,
        default: 500,
        description: 'Minimum milliseconds between progress updates'
      },
      maxBufferSize: {
        type: 'number',
        minimum: 1024 * 1024,  // 1MB minimum
        default: 100 * 1024 * 1024,  // 100MB
        description: 'Maximum bytes before disk fallback'
      },
      streamingTimeout: {
        type: 'number',
        minimum: 60 * 1000,  // 1 minute minimum
        default: 5 * 60 * 1000,  // 5 minutes
        description: 'Milliseconds before abandoned request cleanup'
      }
    }
  };
  
  private context?: ExtensionContext;
  private config: LargeResponseHandlerConfig = DEFAULT_CONFIG;
  private streamingBuffer?: StreamingBuffer;
  private progressTokens = new Map<string | number, string>();  // Track progress tokens by request ID
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...context.config };
    
    // Initialize streaming buffer with configuration
    if (this.config.enableStreaming) {
      this.streamingBuffer = new StreamingBuffer(
        {
          maxBufferSize: this.config.maxBufferSize!,
          progressUpdateInterval: this.config.progressUpdateInterval!,
          requestTimeout: this.config.streamingTimeout!,
          enableDiskFallback: true
        },
        context.logger
      );
      
      // Set up progress notification handler
      this.streamingBuffer.setProgressHandler(async (notification) => {
        // Send MCP progress notification through the proxy
        await this.sendProgressNotification(notification);
      });
    }
    
    // Register hooks for message interception
    context.hooks.beforeStdinForward = this.trackProgressToken.bind(this);
    context.hooks.afterStdoutReceive = this.handleServerResponse.bind(this);
    context.hooks.getAdditionalTools = this.getAdditionalTools.bind(this);
    context.hooks.handleToolCall = this.handleToolCall.bind(this);
    
    context.logger.info('Large Response Handler initialized');
  }
  
  async shutdown(): Promise<void> {
    // Clean up resources
    this.context = undefined;
    this.streamingBuffer = undefined;
  }
  
  /**
   * Track progress tokens from incoming requests
   */
  private async trackProgressToken(message: any): Promise<any> {
    // Check if request has a progress token
    if (message.id && message.params?._meta?.progressToken) {
      this.progressTokens.set(message.id, message.params._meta.progressToken);
      this.context?.logger.debug(
        `Tracked progress token ${message.params._meta.progressToken} for request ${message.id}`
      );
    }
    return message;
  }
  
  /**
   * Send MCP progress notification through the proxy
   */
  private async sendProgressNotification(notification: {
    progressToken: string;
    progress: number;
    total?: number;
    message?: string;
  }): Promise<void> {
    if (!this.context) return;
    
    // Use the injected notification service if available
    if (this.context.notificationService) {
      await this.context.notificationService.sendProgress(notification);
    } else {
      // Fallback warning when service is not available
      this.context.logger.warn('NotificationService not available, progress notification dropped');
    }
  }
  
  /**
   * Handle server responses, detecting and buffering streaming responses
   */
  private async handleServerResponse(message: any): Promise<any> {
    // Check if this is a streaming response
    if (this.isStreamingResponse(message)) {
      const requestId = message.id;
      const progressToken = this.getProgressToken(requestId);
      
      // Start buffering if this is the first chunk
      if (!this.streamingBuffer?.isBuffering(requestId)) {
        this.streamingBuffer?.startBuffering(
          requestId,
          message.result?.method,
          progressToken
        );
      }
      
      // Add chunk to buffer
      await this.streamingBuffer?.addChunk(requestId, message.result);
      
      // If this is the final chunk, process the complete response
      if (this.isStreamingComplete(message)) {
        const chunks = this.streamingBuffer?.completeBuffering(requestId) || [];
        const completeResponse = this.assembleStreamedResponse(chunks);
        
        // Clean up progress token
        this.progressTokens.delete(requestId);
        
        // Apply large response handling if needed
        if (this.shouldHandleResponse(completeResponse)) {
          return this.processLargeResponse(message, completeResponse);
        }
        
        // Return the assembled response
        return {
          ...message,
          result: completeResponse
        };
      }
      
      // For intermediate chunks, return as-is
      return message;
    }
    
    // For non-streaming responses, check if they need handling
    if (this.shouldHandleResponse(message.result)) {
      return this.processLargeResponse(message, message.result);
    }
    
    return message;
  }
  
  /**
   * Check if a message is a streaming response
   */
  private isStreamingResponse(message: any): boolean {
    return message.result?.isPartial === true || 
           message.result?.isPartial === false;
  }
  
  /**
   * Check if streaming is complete
   */
  private isStreamingComplete(message: any): boolean {
    return message.result?.isPartial === false;
  }
  
  /**
   * Get progress token for a request
   */
  private getProgressToken(requestId: string | number): string | undefined {
    return this.progressTokens.get(requestId);
  }
  
  /**
   * Assemble chunks into complete response
   */
  private assembleStreamedResponse(chunks: any[]): any {
    // If chunks contain partial data arrays, concatenate them
    if (chunks.length === 0) return null;
    
    const firstChunk = chunks[0];
    if (Array.isArray(firstChunk?.data)) {
      // Concatenate all data arrays
      const allData = chunks.flatMap(chunk => chunk.data || []);
      return {
        ...firstChunk,
        data: allData,
        isPartial: false
      };
    }
    
    // For other formats, return the last chunk as complete
    return chunks[chunks.length - 1];
  }
  
  /**
   * Check if response should be handled as large
   */
  private shouldHandleResponse(response: any): boolean {
    if (!response) return false;
    
    try {
      const size = Buffer.byteLength(this.safeJsonStringify(response), 'utf8');
      return size > this.config.threshold;
    } catch {
      // If we can't serialize it, assume it's large
      return true;
    }
  }
  
  /**
   * Safely stringify JSON, handling circular references
   */
  private safeJsonStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }
  
  /**
   * Process large response (placeholder for actual implementation)
   */
  private async processLargeResponse(message: any, response: any): Promise<any> {
    // TODO: Implement actual large response processing
    // - Persist to disk
    // - Generate schema
    // - Create DuckDB if enabled
    // - Return metadata
    
    this.context?.logger.info(
      `Large response detected: ${Buffer.byteLength(this.safeJsonStringify(response), 'utf8')} bytes`
    );
    
    return message;
  }
  
  /**
   * Provide additional MCP tools
   */
  private async getAdditionalTools(): Promise<ToolDefinition[]> {
    return [
      {
        name: 'mcpmon.analyze-with-duckdb',
        description: 'Analyze persisted large response data using DuckDB SQL queries',
        inputSchema: {
          type: 'object',
          properties: {
            datasetId: {
              type: 'string',
              description: 'ID of the persisted dataset'
            },
            query: {
              type: 'string', 
              description: 'SQL query to run against the dataset'
            }
          },
          required: ['datasetId', 'query']
        }
      },
      {
        name: 'mcpmon.list-saved-datasets',
        description: 'List all saved large response datasets',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of datasets to return'
            }
          }
        }
      }
    ];
  }
  
  /**
   * Handle tool calls for LRH-specific tools
   */
  private async handleToolCall(toolName: string, args: any): Promise<any | null> {
    switch (toolName) {
      case 'mcpmon.analyze-with-duckdb':
        // TODO: Implement DuckDB query execution
        return {
          error: 'DuckDB analysis not yet implemented'
        };
        
      case 'mcpmon.list-saved-datasets':
        // TODO: Implement dataset listing
        return {
          datasets: [],
          message: 'Dataset listing not yet implemented'
        };
        
      default:
        // Not our tool
        return null;
    }
  }
}