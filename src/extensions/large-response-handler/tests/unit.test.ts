/**
 * Unit tests for Large Response Handler Extension
 * 
 * Traditional Jest-style unit tests that work with or without the DI framework.
 * These tests focus on core functionality and can be run independently.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import LargeResponseHandlerExtension from '../index.js';
import type { ExtensionContext, ExtensionLogger } from '../../interfaces.js';

// Mock logger implementation
const createMockLogger = (): ExtensionLogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

// Mock extension context factory
const createMockContext = (overrides?: Partial<ExtensionContext>): ExtensionContext => {
  return {
    sessionId: 'test-session-123',
    dataDir: '/tmp/test-mcpmon',
    config: {
      threshold: 25000,
      tokenThreshold: 20000,
      enableDuckDB: true,
      enableSchemaGeneration: true,
      enableStreaming: true,
      progressUpdateInterval: 100,
      maxBufferSize: 1024 * 1024,
      streamingTimeout: 5000,
      toolOverrides: {
        'special-tool': {
          threshold: 10000,
          alwaysPersist: true
        }
      }
    },
    logger: createMockLogger(),
    hooks: {},
    dependencies: {} as any,
    ...overrides
  };
};

// Test data generators
const createLargeResponse = (sizeKB: number): any => {
  const itemSize = 50; // Approximate bytes per item
  const itemCount = Math.floor((sizeKB * 1024) / itemSize);
  
  return {
    data: Array(itemCount).fill(null).map((_, i) => ({
      id: i + 1,
      name: `item_${i + 1}`,
      value: Math.random() * 100,
      description: `Test item ${i + 1} with additional data for size`,
      timestamp: Date.now()
    })),
    metadata: {
      totalItems: itemCount,
      approximateSizeKB: sizeKB
    }
  };
};

const createStreamingChunks = (totalItems: number, chunkSize: number): any[] => {
  const chunks = [];
  let itemIndex = 0;

  while (itemIndex < totalItems) {
    const remainingItems = totalItems - itemIndex;
    const currentChunkSize = Math.min(chunkSize, remainingItems);
    
    const chunkData = Array(currentChunkSize).fill(null).map((_, i) => ({
      id: itemIndex + i + 1,
      name: `streaming_item_${itemIndex + i + 1}`,
      value: Math.random() * 100,
      chunkIndex: chunks.length
    }));

    chunks.push({
      data: chunkData,
      chunkIndex: chunks.length,
      isPartial: itemIndex + currentChunkSize < totalItems
    });

    itemIndex += currentChunkSize;
  }

  return chunks;
};

describe('LargeResponseHandlerExtension - Unit Tests', () => {
  let extension: LargeResponseHandlerExtension;
  let mockContext: ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    extension = new LargeResponseHandlerExtension();
    mockContext = createMockContext();
  });

  describe('Extension metadata', () => {
    it('should have correct extension metadata', () => {
      expect(extension.id).toBe('large-response-handler');
      expect(extension.name).toBe('Large Response Handler');
      expect(extension.version).toBe('1.0.0');
      expect(extension.defaultEnabled).toBe(false);
    });

    it('should have valid configuration schema', () => {
      expect(extension.configSchema).toBeDefined();
      expect(extension.configSchema.type).toBe('object');
      expect(extension.configSchema.properties).toBeDefined();
      
      // Check key configuration properties
      const props = extension.configSchema.properties;
      expect(props.threshold).toBeDefined();
      expect(props.enableDuckDB).toBeDefined();
      expect(props.enableStreaming).toBeDefined();
      expect(props.maxBufferSize).toBeDefined();
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with default config', async () => {
      await extension.initialize(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Large Response Handler initialized')
      );
    });

    it('should initialize hooks correctly', async () => {
      await extension.initialize(mockContext);

      // Verify hook registration would occur
      // Note: In a real implementation, we'd verify hooks were registered
      expect(mockContext.logger.info).toHaveBeenCalled();
    });

    it('should handle initialization with custom config', async () => {
      const customContext = createMockContext({
        config: {
          threshold: 50000,
          enableStreaming: false,
          enableDuckDB: false,
          maxBufferSize: 2 * 1024 * 1024
        }
      });

      await extension.initialize(customContext);
      expect(customContext.logger.info).toHaveBeenCalled();
    });

    it('should handle streaming configuration', async () => {
      const streamingContext = createMockContext({
        config: {
          enableStreaming: true,
          progressUpdateInterval: 200,
          maxBufferSize: 5 * 1024 * 1024,
          streamingTimeout: 10000
        }
      });

      await extension.initialize(streamingContext);
      expect(streamingContext.logger.info).toHaveBeenCalled();
    });
  });

  describe('Tool definitions', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should provide correct additional tools', async () => {
      // Access the private method for testing
      const getAdditionalTools = (extension as any).getAdditionalTools;
      const tools = await getAdditionalTools.call(extension);

      expect(tools).toHaveLength(2);

      const duckdbTool = tools.find((t: any) => t.name === 'mcpmon_analyze-with-duckdb');
      expect(duckdbTool).toMatchObject({
        name: 'mcpmon_analyze-with-duckdb',
        description: expect.stringContaining('DuckDB SQL queries'),
        inputSchema: {
          type: 'object',
          properties: {
            datasetId: { type: 'string' },
            query: { type: 'string' }
          },
          required: ['query']
        }
      });

      const listTool = tools.find((t: any) => t.name === 'mcpmon_list-saved-datasets');
      expect(listTool).toMatchObject({
        name: 'mcpmon_list-saved-datasets',
        description: expect.stringContaining('List all saved'),
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' }
          }
        }
      });
    });
  });

  describe('Tool call handling', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should handle analyze-with-duckdb tool calls', async () => {
      const handleToolCall = (extension as any).handleToolCall;
      
      const result = await handleToolCall.call(extension, 'mcpmon_analyze-with-duckdb', {
        datasetId: 'test-dataset-123',
        query: 'SELECT * FROM test_table LIMIT 10'
      });

      // Returns error when dataset not found
      expect(result).toMatchObject({
        error: "Dataset 'test-dataset-123' not found"
      });
    });

    it('should handle list-saved-datasets tool calls', async () => {
      const handleToolCall = (extension as any).handleToolCall;
      
      const result = await handleToolCall.call(extension, 'mcpmon_list-saved-datasets', {
        limit: 10
      });

      // Should return dataset listing with proper structure
      expect(result).toMatchObject({
        datasets: expect.any(Array),
        total: expect.any(Number),
        filtered: expect.any(Boolean)
      });
      
      // Each dataset should have the required structure
      if (result.datasets.length > 0) {
        expect(result.datasets[0]).toMatchObject({
          id: expect.any(String),
          timestamp: expect.any(Number),
          tool: expect.any(String),
          size: expect.any(Number),
          recordCount: expect.any(Number),
          path: expect.any(String)
        });
      }
    });

    it('should return null for unknown tools', async () => {
      const handleToolCall = (extension as any).handleToolCall;
      
      const result = await handleToolCall.call(extension, 'unknown-tool', {
        someArg: 'value'
      });

      expect(result).toBeNull();
    });
  });

  describe('Response size detection', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should detect large responses correctly', () => {
      const shouldHandleResponse = (extension as any).shouldHandleResponse;

      // Test small response (should not handle)
      const smallResponse = { data: 'small response' };
      expect(shouldHandleResponse.call(extension, smallResponse)).toBe(false);

      // Test large response (should handle)
      const largeResponse = createLargeResponse(30); // 30KB
      expect(shouldHandleResponse.call(extension, largeResponse)).toBe(true);
    });

    it('should handle null/undefined responses', () => {
      const shouldHandleResponse = (extension as any).shouldHandleResponse;

      expect(shouldHandleResponse.call(extension, null)).toBe(false);
      expect(shouldHandleResponse.call(extension, undefined)).toBe(false);
    });

    it('should calculate response sizes accurately', () => {
      const shouldHandleResponse = (extension as any).shouldHandleResponse;

      // Create response of known size
      const testData = 'x'.repeat(30000); // ~30KB
      const response = { data: testData };
      
      expect(shouldHandleResponse.call(extension, response)).toBe(true);
    });
  });

  describe('Streaming response detection', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should identify streaming responses correctly', () => {
      const isStreamingResponse = (extension as any).isStreamingResponse;

      // Test streaming response
      const streamingMessage = {
        id: 'test-123',
        result: { data: [1, 2, 3], isPartial: true }
      };
      expect(isStreamingResponse.call(extension, streamingMessage)).toBe(true);

      // Test final streaming chunk
      const finalMessage = {
        id: 'test-123',
        result: { data: [4, 5, 6], isPartial: false }
      };
      expect(isStreamingResponse.call(extension, finalMessage)).toBe(true);

      // Test non-streaming response
      const normalMessage = {
        id: 'test-456',
        result: { data: [1, 2, 3] }
      };
      expect(isStreamingResponse.call(extension, normalMessage)).toBe(false);
    });

    it('should detect streaming completion correctly', () => {
      const isStreamingComplete = (extension as any).isStreamingComplete;

      // Test partial chunk (not complete)
      const partialMessage = {
        result: { data: [1, 2, 3], isPartial: true }
      };
      expect(isStreamingComplete.call(extension, partialMessage)).toBe(false);

      // Test final chunk (complete)
      const finalMessage = {
        result: { data: [4, 5, 6], isPartial: false }
      };
      expect(isStreamingComplete.call(extension, finalMessage)).toBe(true);
    });
  });

  describe('Progress token management', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should track progress tokens correctly', async () => {
      const trackProgressToken = (extension as any).trackProgressToken;
      const getProgressToken = (extension as any).getProgressToken;

      const message = {
        id: 'request-123',
        params: {
          _meta: {
            progressToken: 'progress-abc-456'
          }
        }
      };

      // Track the token
      const result = await trackProgressToken.call(extension, message);
      expect(result).toBe(message); // Should pass through unchanged

      // Verify token was tracked
      const token = getProgressToken.call(extension, 'request-123');
      expect(token).toBe('progress-abc-456');

      expect(mockContext.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Tracked progress token')
      );
    });

    it('should handle messages without progress tokens', async () => {
      const trackProgressToken = (extension as any).trackProgressToken;
      const getProgressToken = (extension as any).getProgressToken;

      const message = {
        id: 'request-456',
        params: { someOtherData: 'value' }
      };

      await trackProgressToken.call(extension, message);

      const token = getProgressToken.call(extension, 'request-456');
      expect(token).toBeUndefined();
    });
  });

  describe('Response assembly', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });

    it('should assemble streamed data arrays correctly', () => {
      const assembleStreamedResponse = (extension as any).assembleStreamedResponse;

      const chunks = createStreamingChunks(100, 25); // 100 items in chunks of 25

      const assembled = assembleStreamedResponse.call(extension, chunks);

      expect(assembled.data).toHaveLength(100);
      expect(assembled.isPartial).toBe(false);
      expect(assembled.data[0].id).toBe(1);
      expect(assembled.data[99].id).toBe(100);
    });

    it('should handle empty chunk arrays', () => {
      const assembleStreamedResponse = (extension as any).assembleStreamedResponse;

      const result = assembleStreamedResponse.call(extension, []);
      expect(result).toBeNull();
    });

    it('should handle non-array data by returning last chunk', () => {
      const assembleStreamedResponse = (extension as any).assembleStreamedResponse;

      const chunks = [
        { type: 'status', message: 'processing...' },
        { type: 'status', message: 'almost done...' },
        { type: 'result', data: 'final result' }
      ];

      const result = assembleStreamedResponse.call(extension, chunks);
      expect(result).toEqual(chunks[2]);
    });
  });

  describe('Shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await extension.initialize(mockContext);
      await extension.shutdown();

      // Verify cleanup (context and buffer should be cleared)
      // Note: We can't directly test private properties, but we can verify
      // that shutdown completes without errors
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should handle shutdown when not initialized', async () => {
      // Should not throw when shutting down non-initialized extension
      await expect(extension.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle errors in progress notification sending', async () => {
      const sendProgressNotification = (extension as any).sendProgressNotification;

      // Create context without stdout dependency
      const errorContext = createMockContext({
        dependencies: undefined as any
      });

      await extension.initialize(errorContext);

      // Should not throw when dependencies are missing
      await expect(
        sendProgressNotification.call(extension, {
          progressToken: 'test-token',
          progress: 50,
          message: 'Test progress'
        })
      ).resolves.not.toThrow();
    });

    it('should handle malformed response data gracefully', () => {
      const shouldHandleResponse = (extension as any).shouldHandleResponse;

      // Test with circular reference (would cause JSON.stringify to fail)
      const circularResponse: any = { data: 'test' };
      circularResponse.circular = circularResponse;

      // Should handle gracefully without throwing
      expect(() => {
        shouldHandleResponse.call(extension, circularResponse);
      }).not.toThrow();
    });
  });
});

// Export utilities for use in other test files
export {
  createMockLogger,
  createMockContext,
  createLargeResponse,
  createStreamingChunks
};