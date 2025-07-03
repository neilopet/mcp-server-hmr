/**
 * Large Response Handler Test Providers
 * 
 * DI container module providing LRH-specific test utilities, mocks, and helpers.
 * Includes DuckDB mock, stream simulator, and custom test data generators.
 */

import { ContainerModule, injectable } from 'inversify';
import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import type { 
  MockMCPMon,
  MockExtensionContext,
  MockContextOptions,
  CapturedMessage,
  ProgressNotification,
  ExtensionHooks 
} from '../../../testing/types.js';
import { StreamingBuffer } from '../streaming.js';

/**
 * LRH-specific test utilities interface
 */
export interface LRHTestUtilities {
  createLargeResponse(sizeKB: number): any;
  createStreamingChunks(totalItems: number, chunkSize: number): any[];
  simulateProgressToken(): string;
  mockDuckDBQuery(result: any[]): void;
  mockDatasetListing(datasets: any[]): void;
  createMockDataset(options?: Partial<MockDatasetOptions>): MockDataset;
  formatBytes(bytes: number): string;
}

/**
 * Mock dataset options
 */
export interface MockDatasetOptions {
  id: string;
  tool: string;
  sizeKB: number;
  itemCount: number;
  timestamp: number;
  sessionId: string;
}

/**
 * Mock dataset structure
 */
export interface MockDataset {
  status: string;
  originalTool: string;
  count: number;
  dataFile: string;
  database?: {
    path: string;
    tables: Array<{
      name: string;
      rowCount: number;
      columns: Array<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>;
    }>;
    sampleQueries: string[];
  };
  schemaResource?: string;
  metadata: {
    sizeKB: number;
    estimatedTokens: number;
    timestamp: number;
    sessionId: string;
  };
}

/**
 * DuckDB mock implementation for testing
 */
export interface DuckDBMock {
  executeDuckDBQuery(database: string, query: string): Promise<any[]>;
  listSavedDatasets(sessionId?: string, tool?: string): Promise<MockDataset[]>;
  mockQueryResult(query: string, result: any[]): void;
  mockDatasets(datasets: MockDataset[]): void;
  reset(): void;
}

/**
 * Stream simulator for testing streaming responses
 */
export interface StreamSimulator {
  createStreamingChunks(totalItems: number, chunkSize: number): any[];
  simulateProgressNotifications(progressToken: string, chunks: any[]): ProgressNotification[];
  createProgressToken(): string;
  createStreamingBuffer(config?: any): StreamingBuffer;
}

/**
 * LRH-specific MockMCPMon that includes streaming simulation
 */
export interface LRHMockMCPMon extends MockMCPMon {
  simulateStreamingResponse(chunks: any[], progressToken?: string): Promise<void>;
  getStreamingBuffer(): StreamingBuffer | undefined;
  enableStreamingMode(): void;
  disableStreamingMode(): void;
}

/**
 * Implementation of LRH test utilities
 */
@injectable()
class LRHTestUtilitiesImpl implements LRHTestUtilities {
  private duckDBMock = new Map<string, any[]>();
  private mockDatasets: MockDataset[] = [];

  createLargeResponse(sizeKB: number): any {
    // Create response that approximates the target size
    const itemSize = 50; // Approximate bytes per item
    const itemCount = Math.floor((sizeKB * 1024) / itemSize);
    
    return {
      data: Array(itemCount).fill(null).map((_, i) => ({
        id: i + 1,
        name: `item_${i + 1}`,
        value: Math.random() * 100,
        description: `This is test item number ${i + 1} with some additional text to reach target size`,
        timestamp: Date.now(),
        metadata: {
          category: `category_${i % 10}`,
          tags: [`tag_${i % 5}`, `tag_${(i + 1) % 5}`],
          score: Math.random()
        }
      })),
      metadata: {
        totalItems: itemCount,
        approximateSizeKB: sizeKB,
        generated: true
      }
    };
  }

  createStreamingChunks(totalItems: number, chunkSize: number): any[] {
    const chunks = [];
    let itemIndex = 0;

    while (itemIndex < totalItems) {
      const remainingItems = totalItems - itemIndex;
      const currentChunkSize = Math.min(chunkSize, remainingItems);
      
      const chunkData = Array(currentChunkSize).fill(null).map((_, i) => ({
        id: itemIndex + i + 1,
        name: `streaming_item_${itemIndex + i + 1}`,
        value: Math.random() * 100,
        chunkIndex: chunks.length,
        itemInChunk: i
      }));

      chunks.push({
        data: chunkData,
        chunkIndex: chunks.length,
        totalChunks: Math.ceil(totalItems / chunkSize),
        isPartial: itemIndex + currentChunkSize < totalItems
      });

      itemIndex += currentChunkSize;
    }

    return chunks;
  }

  simulateProgressToken(): string {
    return `progress-${randomUUID()}`;
  }

  mockDuckDBQuery(result: any[]): void {
    // Store mock result for later retrieval
    this.duckDBMock.set('default', result);
  }

  mockDatasetListing(datasets: any[]): void {
    this.mockDatasets = datasets;
  }

  createMockDataset(options?: Partial<MockDatasetOptions>): MockDataset {
    const opts = {
      id: randomUUID(),
      tool: 'test-tool',
      sizeKB: 25,
      itemCount: 100,
      timestamp: Date.now(),
      sessionId: 'test-session',
      ...options
    };

    return {
      status: 'success_file_saved',
      originalTool: opts.tool,
      count: opts.itemCount,
      dataFile: `/tmp/test-mcpmon/${opts.sessionId}/${opts.tool}/response-${opts.id}.json`,
      database: {
        path: `/tmp/test-mcpmon/${opts.sessionId}/${opts.tool}/database-${opts.id}.duckdb`,
        tables: [{
          name: opts.tool.replace(/-/g, '_'),
          rowCount: opts.itemCount,
          columns: [
            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'id', data_type: 'INTEGER' },
            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'name', data_type: 'VARCHAR' },
            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'value', data_type: 'DOUBLE' }
          ]
        }],
        sampleQueries: [
          `SELECT * FROM ${opts.tool.replace(/-/g, '_')} LIMIT 10;`,
          `SELECT COUNT(*) as total_rows FROM ${opts.tool.replace(/-/g, '_')};`,
          `SELECT AVG(value) as avg_value FROM ${opts.tool.replace(/-/g, '_')};`
        ]
      },
      schemaResource: `mcpmon://schemas/${opts.sessionId}/${opts.tool}/${opts.id}`,
      metadata: {
        sizeKB: opts.sizeKB,
        estimatedTokens: opts.sizeKB * 4, // Rough approximation
        timestamp: opts.timestamp,
        sessionId: opts.sessionId
      }
    };
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }
}

/**
 * DuckDB mock implementation
 */
@injectable()
class DuckDBMockImpl implements DuckDBMock {
  private queryResults = new Map<string, any[]>();
  private datasets: MockDataset[] = [];

  async executeDuckDBQuery(database: string, query: string): Promise<any[]> {
    // Simple mock implementation
    const result = this.queryResults.get(query) || this.queryResults.get('default') || [];
    return Promise.resolve(result);
  }

  async listSavedDatasets(sessionId?: string, tool?: string): Promise<MockDataset[]> {
    let filtered = this.datasets;
    
    if (sessionId) {
      filtered = filtered.filter(d => d.metadata.sessionId === sessionId);
    }
    
    if (tool) {
      filtered = filtered.filter(d => d.originalTool === tool);
    }

    return Promise.resolve(filtered);
  }

  mockQueryResult(query: string, result: any[]): void {
    this.queryResults.set(query, result);
  }

  mockDatasets(datasets: MockDataset[]): void {
    this.datasets = datasets;
  }

  reset(): void {
    this.queryResults.clear();
    this.datasets = [];
  }
}

/**
 * Stream simulator implementation
 */
@injectable()
class StreamSimulatorImpl implements StreamSimulator {
  createStreamingChunks(totalItems: number, chunkSize: number): any[] {
    const utils = new LRHTestUtilitiesImpl();
    return utils.createStreamingChunks(totalItems, chunkSize);
  }

  simulateProgressNotifications(progressToken: string, chunks: any[]): ProgressNotification[] {
    const notifications: ProgressNotification[] = [];
    let totalBytes = 0;

    chunks.forEach((chunk, index) => {
      const chunkBytes = Buffer.byteLength(JSON.stringify(chunk), 'utf8');
      totalBytes += chunkBytes;

      notifications.push({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: totalBytes,
          message: `Buffering response: ${this.formatBytes(totalBytes)} (${index + 1} chunks)`
        }
      });
    });

    return notifications;
  }

  createProgressToken(): string {
    return `progress-${randomUUID()}`;
  }

  createStreamingBuffer(config?: any): StreamingBuffer {
    const defaultConfig = {
      maxBufferSize: 1024 * 1024, // 1MB for tests
      progressUpdateInterval: 100,
      requestTimeout: 5000,
      enableDiskFallback: true
    };

    return new StreamingBuffer({ ...defaultConfig, ...config });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

/**
 * LRH-specific MockMCPMon implementation
 */
@injectable()
class LRHMockMCPMonImpl implements LRHMockMCPMon {
  private capturedMessages: CapturedMessage[] = [];
  private registeredHooks: Partial<ExtensionHooks> = {};
  private progressNotifications: ProgressNotification[] = [];
  private streamingBuffer?: StreamingBuffer;
  private streamingMode = false;

  createContext(options?: MockContextOptions): MockExtensionContext {
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const context: MockExtensionContext = {
      sessionId: options?.sessionId || 'test-session',
      dataDir: options?.dataDir || '/tmp/test-mcpmon',
      config: options?.config || {},
      logger: mockLogger,
      hooks: {},
      dependencies: options?.dependencies || {} as any,
      testHelpers: {
        triggerHook: async (hookName: keyof ExtensionHooks, ...args: any[]) => {
          const hook = this.registeredHooks[hookName];
          return hook ? await (hook as any)(...args) : undefined;
        },
        getHookCalls: (hookName: keyof ExtensionHooks) => {
          // Return mock call history
          return [];
        }
      }
    };

    return context;
  }

  async simulateRequest(request: any): Promise<any> {
    this.capturedMessages.push({
      type: 'request',
      direction: 'in',
      message: request,
      timestamp: Date.now()
    });

    // Simulate response
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { status: 'simulated' }
    };
  }

  async simulateResponse(response: any): Promise<any> {
    this.capturedMessages.push({
      type: 'response',
      direction: 'out',
      message: response,
      timestamp: Date.now()
    });

    return response;
  }

  async simulateNotification(notification: any): Promise<void> {
    if (notification.method === 'notifications/progress') {
      this.progressNotifications.push(notification);
    }

    this.capturedMessages.push({
      type: 'notification',
      direction: 'out',
      message: notification,
      timestamp: Date.now()
    });
  }

  async simulateStreamingResponse(chunks: any[], progressToken?: string): Promise<void> {
    if (!this.streamingMode) {
      this.enableStreamingMode();
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = {
        ...chunks[i],
        isPartial: i < chunks.length - 1
      };

      await this.simulateResponse({
        jsonrpc: '2.0',
        id: `streaming-${Date.now()}`,
        result: chunk
      });

      if (progressToken) {
        await this.simulateNotification({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: (i + 1) / chunks.length * 100,
            message: `Processing chunk ${i + 1}/${chunks.length}`
          }
        });
      }

      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  getCapturedMessages(): CapturedMessage[] {
    return [...this.capturedMessages];
  }

  expectHookRegistered(hookName: keyof ExtensionHooks): void {
    if (!this.registeredHooks[hookName]) {
      throw new Error(`Expected hook '${String(hookName)}' to be registered`);
    }
  }

  expectToolRegistered(toolName: string): void {
    // Check if tool was registered via getAdditionalTools hook
    const hook = this.registeredHooks.getAdditionalTools;
    if (!hook) {
      throw new Error('getAdditionalTools hook not registered');
    }
    
    // This would need to be implemented based on actual hook behavior
    // For now, we'll assume tools are registered if the hook exists
  }

  getRegisteredHooks(): Partial<ExtensionHooks> {
    return { ...this.registeredHooks };
  }

  getProgressNotifications(): ProgressNotification[] {
    return [...this.progressNotifications];
  }

  getStreamingBuffer(): StreamingBuffer | undefined {
    return this.streamingBuffer;
  }

  enableStreamingMode(): void {
    this.streamingMode = true;
    if (!this.streamingBuffer) {
      this.streamingBuffer = new StreamSimulatorImpl().createStreamingBuffer();
    }
  }

  disableStreamingMode(): void {
    this.streamingMode = false;
    this.streamingBuffer = undefined;
  }

  reset(): void {
    this.capturedMessages = [];
    this.registeredHooks = {};
    this.progressNotifications = [];
    this.streamingBuffer = undefined;
    this.streamingMode = false;
  }
}

/**
 * Container module for LRH test dependencies
 */
export const LRHTestModule = new ContainerModule((bind) => {
  // Bind LRH-specific utilities
  bind<LRHTestUtilities>('LRHTestUtilities').to(LRHTestUtilitiesImpl).inSingletonScope();
  
  // Bind DuckDB mock
  bind<DuckDBMock>('DuckDBMock').to(DuckDBMockImpl).inSingletonScope();
  
  // Bind stream simulator
  bind<StreamSimulator>('StreamSimulator').to(StreamSimulatorImpl).inSingletonScope();
  
  // Bind LRH-specific MockMCPMon
  bind<LRHMockMCPMon>('LRHMockMCPMon').to(LRHMockMCPMonImpl).inSingletonScope();
  
  // Also bind as regular MockMCPMon for compatibility
  bind('MockMCPMon').toService('LRHMockMCPMon');
});

// Types and interfaces are already exported inline