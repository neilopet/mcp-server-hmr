import { Extension, ExtensionContext, ToolDefinition } from '../interfaces.js';
import { LargeResponseHandler } from './handler.js';
import { z } from 'zod';

export class LargeResponseHandlerExtension implements Extension {
  public readonly id = 'large-response-handler';
  public readonly name = 'Large Response Handler';
  public readonly version = '1.0.0';
  public readonly defaultEnabled = false;

  public readonly configSchema = z.object({
    threshold: z.number().min(1000).default(50000).describe('Response size threshold in bytes'),
    dataDir: z.string().default('./data').describe('Directory to store large responses'),
    enableDuckDB: z.boolean().default(true).describe('Enable DuckDB analysis features'),
    compressionLevel: z.number().min(0).max(9).default(6).describe('Gzip compression level (0-9)'),
    maxStoredResponses: z.number().min(1).default(100).describe('Maximum number of stored responses'),
    retentionDays: z.number().min(1).default(7).describe('Number of days to retain stored responses'),
  });

  private handler?: LargeResponseHandler;
  private context?: ExtensionContext;
  private pendingToolCall?: string;

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    const config = context.config as z.infer<typeof this.configSchema>;
    
    this.handler = new LargeResponseHandler({
      threshold: config.threshold,
      dataDir: config.dataDir,
      enableDuckDB: config.enableDuckDB,
      compressionLevel: config.compressionLevel,
      maxStoredResponses: config.maxStoredResponses,
      retentionDays: config.retentionDays,
    });

    await this.handler.initialize();

    // Track tool requests to know when to intercept responses
    context.hooks.beforeStdinForward.tap(this.name, async (message) => {
      const parsed = JSON.parse(message);
      if (parsed.method === 'tools/call' && parsed.params?.name) {
        this.pendingToolCall = parsed.params.name;
      }
      return message;
    });

    // Intercept large responses
    context.hooks.afterStdoutReceive.tap(this.name, async (message) => {
      try {
        const parsed = JSON.parse(message);
        
        // Check if this is a tool response and if it's large
        if (parsed.result && this.pendingToolCall && message.length > config.threshold) {
          const handled = await this.handler.handleLargeResponse(
            this.pendingToolCall,
            parsed.result,
            message
          );

          if (handled) {
            // Replace the large response with a summary
            parsed.result = handled;
            return JSON.stringify(parsed);
          }
        }

        // Clear pending tool call after processing
        if (parsed.result) {
          this.pendingToolCall = undefined;
        }

        return message;
      } catch (error) {
        // If parsing fails or any error occurs, return original message
        return message;
      }
    });

    // Register additional tools
    context.hooks.getAdditionalTools.tap(this.name, async (tools) => {
      const additionalTools: ToolDefinition[] = [];

      if (config.enableDuckDB) {
        additionalTools.push({
          name: 'analyze-with-duckdb',
          description: 'Analyze saved dataset using DuckDB SQL queries',
          inputSchema: {
            type: 'object',
            properties: {
              datasetId: {
                type: 'string',
                description: 'ID of the saved dataset to analyze',
              },
              query: {
                type: 'string',
                description: 'SQL query to execute on the dataset',
              },
            },
            required: ['datasetId', 'query'],
          },
        });
      }

      additionalTools.push({
        name: 'list-saved-datasets',
        description: 'List all saved datasets from large responses',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of datasets to return',
              default: 10,
            },
          },
        },
      });

      return [...tools, ...additionalTools];
    });

    // Handle tool calls for our injected tools
    context.hooks.handleToolCall.tap(this.name, async (toolName, args) => {
      if (!this.handler) {
        return undefined;
      }

      switch (toolName) {
        case 'analyze-with-duckdb':
          if (config.enableDuckDB && args.datasetId && args.query) {
            try {
              const result = await this.handler.analyzeWithDuckDB(
                args.datasetId as string,
                args.query as string
              );
              return { handled: true, result };
            } catch (error) {
              return {
                handled: true,
                result: {
                  error: `DuckDB analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              };
            }
          }
          break;

        case 'list-saved-datasets':
          try {
            const limit = typeof args.limit === 'number' ? args.limit : 10;
            const datasets = await this.handler.listDatasets(limit);
            return { handled: true, result: { datasets } };
          } catch (error) {
            return {
              handled: true,
              result: {
                error: `Failed to list datasets: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            };
          }
      }

      return undefined;
    });
  }

  async shutdown(): Promise<void> {
    if (this.handler) {
      await this.handler.shutdown();
      this.handler = undefined;
    }
    this.context = undefined;
    this.pendingToolCall = undefined;
  }
}

export default LargeResponseHandlerExtension;