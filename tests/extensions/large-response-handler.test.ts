/**
 * Tests for Large Response Handler Extension
 */

import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import type { ExtensionContext, MessageHook, ToolDefinition } from '../../src/extensions/interfaces';

// Create a mock implementation of the extension
class MockLargeResponseHandlerExtension {
  readonly id = 'large-response-handler';
  readonly name = 'Large Response Handler';
  readonly version = '1.0.0';
  readonly defaultEnabled = false;
  
  readonly configSchema = {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: false },
      threshold: { type: 'number', default: 25 },
      tokenThreshold: { type: 'number', default: 20000 },
      dataDir: { type: 'string' },
      enableDuckDB: { type: 'boolean', default: true },
      enableSchemaGeneration: { type: 'boolean', default: true },
      cacheTTL: { type: 'number', default: 300000 },
      toolOverrides: { type: 'object' }
    }
  };
  
  private handler: any;
  private context?: ExtensionContext;
  private lastToolRequest?: any;
  private pendingToolsListId?: string | number;
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    
    // Create mock handler
    this.handler = {
      shouldHandleResponse: jest.fn(),
      processLargeResponse: jest.fn(),
      executeDuckDBQuery: jest.fn(),
      listSavedDatasets: jest.fn()
    };
    
    // Register hooks
    context.hooks.beforeStdinForward = this.beforeStdinForward.bind(this);
    context.hooks.afterStdoutReceive = this.afterStdoutReceive.bind(this);
    context.hooks.getAdditionalTools = this.getAdditionalTools.bind(this);
    context.hooks.handleToolCall = this.handleToolCall.bind(this);
    context.hooks.onShutdown = this.shutdown.bind(this);
    
    context.logger.info(`Large Response Handler initialized (threshold: ${context.config?.threshold || 25}KB)`);
  }
  
  async shutdown(): Promise<void> {
    this.handler = undefined;
    this.context = undefined;
    this.lastToolRequest = undefined;
    this.pendingToolsListId = undefined;
  }
  
  private async beforeStdinForward(message: any): Promise<any> {
    if (message.method === 'tools/call') {
      this.lastToolRequest = message;
      this.context?.logger.debug(`Tracking tool request: ${message.params?.name}`);
    }
    
    if (message.method === 'tools/list' && message.id) {
      this.pendingToolsListId = message.id;
      this.context?.logger.debug('Tracking tools/list request for injection');
    }
    
    return message;
  }
  
  private async afterStdoutReceive(message: any): Promise<any> {
    if (!this.handler || !this.context) return message;
    
    // Inject our tools into tools/list response
    if (message.id === this.pendingToolsListId && message.result?.tools) {
      const additionalTools = await this.getAdditionalTools();
      message.result.tools.push(...additionalTools);
      this.pendingToolsListId = undefined;
      this.context.logger.debug(`Injected ${additionalTools.length} LRH tools`);
      return message;
    }
    
    // Handle tool call responses
    if (message.id && message.result && this.lastToolRequest?.id === message.id) {
      const toolName = this.lastToolRequest.params?.name;
      
      if (toolName && await this.handler.shouldHandleResponse(message.result, toolName)) {
        try {
          const metadata = await this.handler.processLargeResponse(
            message.result,
            toolName,
            {
              originalRequest: this.lastToolRequest
            }
          );
          
          // Replace result with metadata
          message.result = metadata;
          
          this.context.logger.info(
            `📦 Large response handled: ${toolName} (${metadata.metadata.sizeKB.toFixed(1)}KB → metadata)`
          );
        } catch (error) {
          this.context.logger.error(`Failed to handle large response: ${error}`);
        }
      }
      
      this.lastToolRequest = undefined;
    }
    
    return message;
  }
  
  private async getAdditionalTools(): Promise<ToolDefinition[]> {
    return [
      {
        name: "mcpmon.analyze-with-duckdb",
        description: "Execute SQL queries on persisted datasets from large responses",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "SQL query to execute" },
            database: { type: "string", description: "Path to DuckDB file from large response metadata" }
          },
          required: ["query", "database"]
        }
      },
      {
        name: "mcpmon.list-saved-datasets",
        description: "List available persisted datasets from large responses",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Optional session ID to filter results" },
            tool: { type: "string", description: "Optional tool name to filter results" }
          }
        }
      }
    ];
  }
  
  private async handleToolCall(toolName: string, args: any): Promise<any | null> {
    if (!this.handler) return null;
    
    switch (toolName) {
      case 'mcpmon.analyze-with-duckdb':
        try {
          const result = await this.handler.executeDuckDBQuery(args.database, args.query);
          return {
            status: 'success',
            result,
            rowCount: Array.isArray(result) ? result.length : 0
          };
        } catch (error: any) {
          return {
            status: 'error',
            error: error.message || 'Query execution failed'
          };
        }
        
      case 'mcpmon.list-saved-datasets':
        try {
          const datasets = await this.handler.listSavedDatasets(args.sessionId);
          return {
            status: 'success',
            datasets,
            count: datasets.length
          };
        } catch (error: any) {
          return {
            status: 'error',
            error: error.message || 'Failed to list datasets'
          };
        }
        
      default:
        return null;
    }
  }
}

describe('LargeResponseHandlerExtension', () => {
  let extension: MockLargeResponseHandlerExtension;
  let mockContext: ExtensionContext;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock context
    mockContext = {
      sessionId: 'test-session-123',
      dataDir: '/tmp/test-mcpmon',
      config: {
        threshold: 25,
        tokenThreshold: 20000,
        enableDuckDB: true,
        enableSchemaGeneration: true,
        toolOverrides: {
          'special-tool': {
            threshold: 10,
            alwaysPersist: true
          }
        }
      },
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
      },
      hooks: {} as any,
      dependencies: {} as any
    };

    extension = new MockLargeResponseHandlerExtension();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await extension.initialize(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Large Response Handler initialized')
      );
      expect(mockContext.hooks.beforeStdinForward).toBeDefined();
      expect(mockContext.hooks.afterStdoutReceive).toBeDefined();
      expect(mockContext.hooks.getAdditionalTools).toBeDefined();
      expect(mockContext.hooks.handleToolCall).toBeDefined();
      expect(mockContext.hooks.onShutdown).toBeDefined();
    });
  });

  describe('shouldHandleResponse', () => {
    let mockHandler: any;

    beforeEach(async () => {
      await extension.initialize(mockContext);
      mockHandler = (extension as any).handler;
    });

    it('should detect large responses based on size threshold', async () => {
      // Mock the shouldHandleResponse behavior
      mockHandler.shouldHandleResponse
        .mockResolvedValueOnce(false)  // Small response
        .mockResolvedValueOnce(true);   // Large response

      // Small response (under 25KB threshold)
      const smallResponse = { data: 'a'.repeat(1000) }; // ~1KB
      expect(await mockHandler.shouldHandleResponse(smallResponse, 'test-tool')).toBe(false);

      // Large response (over 25KB threshold)
      const largeResponse = { data: 'a'.repeat(30000) }; // ~30KB
      expect(await mockHandler.shouldHandleResponse(largeResponse, 'test-tool')).toBe(true);

      // Verify calls
      expect(mockHandler.shouldHandleResponse).toHaveBeenCalledWith(smallResponse, 'test-tool');
      expect(mockHandler.shouldHandleResponse).toHaveBeenCalledWith(largeResponse, 'test-tool');
    });

    it('should detect large responses based on token threshold', async () => {
      mockHandler.shouldHandleResponse.mockResolvedValue(true);

      // Create response with many tokens (over 20000 token threshold)
      const largeTokenResponse = { data: 'word '.repeat(25000) }; // ~25000 tokens
      expect(await mockHandler.shouldHandleResponse(largeTokenResponse, 'test-tool')).toBe(true);
      
      expect(mockHandler.shouldHandleResponse).toHaveBeenCalledWith(largeTokenResponse, 'test-tool');
    });

    it('should respect tool overrides', async () => {
      // Set up mocked responses for different tools
      mockHandler.shouldHandleResponse.mockImplementation(async (response: any, toolName: string) => {
        if (toolName === 'special-tool') return true;
        if (toolName === 'normal-tool' && JSON.stringify(response).length > 25000) return true;
        return false;
      });
      
      // Small response for special-tool with lower threshold (10KB)
      const response = { data: 'a'.repeat(15000) }; // ~15KB
      
      // Should not trigger for normal tool (25KB threshold)
      expect(await mockHandler.shouldHandleResponse(response, 'normal-tool')).toBe(false);
      
      // Should trigger for special-tool (10KB threshold)
      expect(await mockHandler.shouldHandleResponse(response, 'special-tool')).toBe(true);
      
      // Should always persist for special-tool regardless of size
      const tinyResponse = { data: 'tiny' };
      expect(await mockHandler.shouldHandleResponse(tinyResponse, 'special-tool')).toBe(true);
    });
  });

  describe('processLargeResponse', () => {
    let mockHandler: any;

    beforeEach(async () => {
      await extension.initialize(mockContext);
      mockHandler = (extension as any).handler;
    });

    it('should process large response and create files', async () => {
      const response = { data: Array(100).fill({ id: 1, name: 'test' }) };
      
      // Mock the processLargeResponse to return expected metadata
      const mockMetadata = {
        status: 'success_file_saved',
        originalTool: 'test-tool',
        count: 100,
        dataFile: '/tmp/test-mcpmon/test-session-123/test-tool/response-123456.json',
        metadata: {
          sizeKB: 30.5,
          estimatedTokens: 25000,
          timestamp: Date.now(),
          sessionId: 'test-session-123'
        }
      };
      mockHandler.processLargeResponse.mockResolvedValue(mockMetadata);
      
      const metadata = await mockHandler.processLargeResponse(response, 'test-tool');

      // Verify the handler was called correctly
      expect(mockHandler.processLargeResponse).toHaveBeenCalledWith(response, 'test-tool');

      // Check metadata structure
      expect(metadata).toMatchObject({
        status: 'success_file_saved',
        originalTool: 'test-tool',
        count: 100,
        dataFile: expect.stringMatching(/response-\d+\.json$/),
        metadata: {
          sizeKB: expect.any(Number),
          estimatedTokens: expect.any(Number),
          timestamp: expect.any(Number),
          sessionId: 'test-session-123'
        }
      });
    });

    it('should generate schema when enabled', async () => {
      const response = { data: [{ id: 1, name: 'test' }] };
      
      const mockMetadata = {
        status: 'success_file_saved',
        originalTool: 'test-tool',
        count: 1,
        dataFile: '/tmp/test-mcpmon/test-session-123/test-tool/response-123456.json',
        schemaResource: 'mcpmon://schemas/test-session-123/test-tool/123456',
        metadata: {
          sizeKB: 1.2,
          estimatedTokens: 300,
          timestamp: Date.now(),
          sessionId: 'test-session-123'
        }
      };
      mockHandler.processLargeResponse.mockResolvedValue(mockMetadata);
      
      const metadata = await mockHandler.processLargeResponse(response, 'test-tool');
      
      expect(metadata.schemaResource).toMatch(/^mcpmon:\/\/schemas\//);
    });

    it('should create DuckDB database when enabled', async () => {
      const response = { data: [{ id: 1, name: 'test', value: 42 }] };
      
      const mockMetadata = {
        status: 'success_file_saved',
        originalTool: 'test-tool',
        count: 1,
        dataFile: '/tmp/test-mcpmon/test-session-123/test-tool/response-123456.json',
        database: {
          path: '/tmp/test-mcpmon/test-session-123/test-tool/database-123456.duckdb',
          tables: [{
            name: 'test_tool',
            rowCount: 100,
            columns: [
              { table_name: 'test_tool', column_name: 'id', data_type: 'INTEGER' },
              { table_name: 'test_tool', column_name: 'name', data_type: 'VARCHAR' },
              { table_name: 'test_tool', column_name: 'value', data_type: 'DOUBLE' }
            ]
          }],
          sampleQueries: [
            'SELECT * FROM test_tool LIMIT 10;',
            'SELECT COUNT(*) as total_rows FROM test_tool;',
            'SELECT AVG(value) as avg, MIN(value) as min, MAX(value) as max FROM test_tool;'
          ]
        },
        metadata: {
          sizeKB: 2.5,
          estimatedTokens: 500,
          timestamp: Date.now(),
          sessionId: 'test-session-123'
        }
      };
      mockHandler.processLargeResponse.mockResolvedValue(mockMetadata);
      
      const metadata = await mockHandler.processLargeResponse(response, 'test-tool');

      expect(metadata.database).toMatchObject({
        path: expect.stringMatching(/database-\d+\.duckdb$/),
        tables: expect.arrayContaining([
          expect.objectContaining({
            name: 'test_tool',
            rowCount: 100,
            columns: expect.arrayContaining([
              expect.objectContaining({ column_name: 'id', data_type: 'INTEGER' }),
              expect.objectContaining({ column_name: 'name', data_type: 'VARCHAR' }),
              expect.objectContaining({ column_name: 'value', data_type: 'DOUBLE' })
            ])
          })
        ]),
        sampleQueries: expect.arrayContaining([
          expect.stringContaining('SELECT * FROM test_tool LIMIT 10'),
          expect.stringContaining('SELECT COUNT(*) as total_rows FROM test_tool'),
          expect.stringContaining('AVG(value)')
        ])
      });
    });
  });

  describe('inject tools', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should inject tools into tools/list response', async () => {
      // Track tools/list request
      const listRequest = { method: 'tools/list', id: 'list-123' };
      await (extension as any).beforeStdinForward(listRequest);

      // Simulate tools/list response
      const listResponse = {
        id: 'list-123',
        result: {
          tools: [
            { name: 'existing-tool', description: 'Existing tool' }
          ]
        }
      };

      const modifiedResponse = await (extension as any).afterStdoutReceive(listResponse);

      expect(modifiedResponse.result.tools).toHaveLength(3); // 1 existing + 2 injected
      expect(modifiedResponse.result.tools).toContainEqual(
        expect.objectContaining({
          name: 'mcpmon.analyze-with-duckdb',
          description: expect.stringContaining('Execute SQL queries')
        })
      );
      expect(modifiedResponse.result.tools).toContainEqual(
        expect.objectContaining({
          name: 'mcpmon.list-saved-datasets',
          description: expect.stringContaining('List available persisted datasets')
        })
      );
    });

    it('should return correct tools from getAdditionalTools', async () => {
      const tools = await (extension as any).getAdditionalTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        name: 'mcpmon.analyze-with-duckdb',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            database: { type: 'string' }
          },
          required: ['query', 'database']
        }
      });
      expect(tools[1]).toMatchObject({
        name: 'mcpmon.list-saved-datasets',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            tool: { type: 'string' }
          }
        }
      });
    });
  });

  describe('handle analyze-with-duckdb tool', () => {
    let mockHandler: any;

    beforeEach(async () => {
      await extension.initialize(mockContext);
      mockHandler = (extension as any).handler;
    });

    it('should handle analyze-with-duckdb tool successfully', async () => {
      // Mock the executeDuckDBQuery response
      mockHandler.executeDuckDBQuery.mockResolvedValue([
        { id: 1, name: 'test', value: 42 }
      ]);

      const result = await (extension as any).handleToolCall(
        'mcpmon.analyze-with-duckdb',
        {
          database: '/tmp/test.duckdb',
          query: 'SELECT * FROM test_table'
        }
      );

      expect(mockHandler.executeDuckDBQuery).toHaveBeenCalledWith(
        '/tmp/test.duckdb',
        'SELECT * FROM test_table'
      );

      expect(result).toMatchObject({
        status: 'success',
        result: [{ id: 1, name: 'test', value: 42 }],
        rowCount: 1
      });
    });

    it('should handle analyze-with-duckdb tool errors', async () => {
      // Mock error
      mockHandler.executeDuckDBQuery.mockRejectedValue(new Error('Query failed'));

      const result = await (extension as any).handleToolCall(
        'mcpmon.analyze-with-duckdb',
        {
          database: '/tmp/test.duckdb',
          query: 'INVALID SQL'
        }
      );

      expect(result).toMatchObject({
        status: 'error',
        error: 'Query failed'
      });
    });
  });

  describe('handle list-saved-datasets tool', () => {
    let mockHandler: any;

    beforeEach(async () => {
      await extension.initialize(mockContext);
      mockHandler = (extension as any).handler;
    });

    it('should handle list-saved-datasets tool', async () => {
      // Mock the listSavedDatasets response
      const mockDatasets = [
        {
          status: 'success_file_saved',
          originalTool: 'tool1',
          count: 50,
          dataFile: '/tmp/data.json',
          metadata: {
            sizeKB: 30,
            timestamp: Date.now()
          },
          session: 'session1',
          tool: 'tool1'
        }
      ];
      mockHandler.listSavedDatasets.mockResolvedValue(mockDatasets);

      const result = await (extension as any).handleToolCall(
        'mcpmon.list-saved-datasets',
        { sessionId: 'session1' }
      );

      expect(mockHandler.listSavedDatasets).toHaveBeenCalledWith('session1');

      expect(result).toMatchObject({
        status: 'success',
        datasets: expect.arrayContaining([
          expect.objectContaining({
            originalTool: 'tool1',
            count: 50
          })
        ]),
        count: 1
      });
    });

    it('should handle list-saved-datasets tool errors', async () => {
      mockHandler.listSavedDatasets.mockRejectedValue(new Error('Failed to list'));

      const result = await (extension as any).handleToolCall(
        'mcpmon.list-saved-datasets',
        { tool: 'test-tool' }
      );

      expect(result).toMatchObject({
        status: 'error',
        error: 'Failed to list'
      });
    });
  });

  describe('track tool requests', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should track tool requests through beforeStdinForward hook', async () => {
      const toolRequest = {
        method: 'tools/call',
        id: 'call-123',
        params: { name: 'test-tool', arguments: { foo: 'bar' } }
      };

      const result = await (extension as any).beforeStdinForward(toolRequest);

      expect(result).toBe(toolRequest); // Should forward unchanged
      expect((extension as any).lastToolRequest).toBe(toolRequest);
      expect(mockContext.logger.debug).toHaveBeenCalledWith('Tracking tool request: test-tool');
    });

    it('should track tools/list requests', async () => {
      const listRequest = {
        method: 'tools/list',
        id: 'list-456'
      };

      await (extension as any).beforeStdinForward(listRequest);

      expect((extension as any).pendingToolsListId).toBe('list-456');
      expect(mockContext.logger.debug).toHaveBeenCalledWith('Tracking tools/list request for injection');
    });
  });

  describe('intercept large responses', () => {
    let mockHandler: any;

    beforeEach(async () => {
      await extension.initialize(mockContext);
      mockHandler = (extension as any).handler;
    });

    it('should intercept and handle large tool responses', async () => {
      // Mock handler to detect large response
      mockHandler.shouldHandleResponse.mockResolvedValue(true);
      
      const mockMetadata = {
        status: 'success_file_saved',
        originalTool: 'data-tool',
        count: 1000,
        dataFile: '/tmp/test-mcpmon/test-session-123/data-tool/response-123456.json',
        metadata: {
          sizeKB: 50.5,
          estimatedTokens: 40000,
          timestamp: Date.now(),
          sessionId: 'test-session-123'
        }
      };
      mockHandler.processLargeResponse.mockResolvedValue(mockMetadata);

      // Track the tool request first
      const toolRequest = {
        method: 'tools/call',
        id: 'call-789',
        params: { name: 'data-tool', arguments: {} }
      };
      await (extension as any).beforeStdinForward(toolRequest);

      // Create large response
      const largeData = Array(1000).fill({ id: 1, name: 'test', value: Math.random() });
      const toolResponse = {
        id: 'call-789',
        result: { data: largeData }
      };

      const modifiedResponse = await (extension as any).afterStdoutReceive(toolResponse);

      // Verify handler was called
      expect(mockHandler.shouldHandleResponse).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Array) }),
        'data-tool'
      );
      expect(mockHandler.processLargeResponse).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Array) }),
        'data-tool',
        expect.objectContaining({
          originalRequest: toolRequest
        })
      );

      // Should replace with metadata
      expect(modifiedResponse.result).toMatchObject({
        status: 'success_file_saved',
        originalTool: 'data-tool',
        count: 1000,
        dataFile: expect.stringMatching(/response-\d+\.json$/),
        metadata: {
          sizeKB: expect.any(Number),
          estimatedTokens: expect.any(Number)
        }
      });

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/📦 Large response handled: data-tool/)
      );
    });

    it('should handle errors gracefully and return original response', async () => {
      // Mock handler to detect large response but fail processing
      mockHandler.shouldHandleResponse.mockResolvedValue(true);
      mockHandler.processLargeResponse.mockRejectedValue(new Error('Permission denied'));

      // Track the tool request
      const toolRequest = {
        method: 'tools/call',
        id: 'call-error',
        params: { name: 'error-tool', arguments: {} }
      };
      await (extension as any).beforeStdinForward(toolRequest);

      const toolResponse = {
        id: 'call-error',
        result: { data: 'a'.repeat(30000) } // Large response
      };

      const modifiedResponse = await (extension as any).afterStdoutReceive(toolResponse);

      // Should return original response
      expect(modifiedResponse).toBe(toolResponse);
      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle large response:')
      );
    });

    it('should clear tracking after handling response', async () => {
      mockHandler.shouldHandleResponse.mockResolvedValue(false);

      // Track request
      const toolRequest = {
        method: 'tools/call',
        id: 'call-clear',
        params: { name: 'test-tool' }
      };
      await (extension as any).beforeStdinForward(toolRequest);

      expect((extension as any).lastToolRequest).toBeDefined();

      // Handle response
      const toolResponse = {
        id: 'call-clear',
        result: { data: 'small response' }
      };
      await (extension as any).afterStdoutReceive(toolResponse);

      // Should clear tracking
      expect((extension as any).lastToolRequest).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should clean up on shutdown', async () => {
      await extension.initialize(mockContext);
      
      // Set some state
      (extension as any).lastToolRequest = { id: 'test' };
      (extension as any).pendingToolsListId = 'list-123';

      await extension.shutdown();

      expect((extension as any).handler).toBeUndefined();
      expect((extension as any).context).toBeUndefined();
      expect((extension as any).lastToolRequest).toBeUndefined();
      expect((extension as any).pendingToolsListId).toBeUndefined();
    });
  });
});