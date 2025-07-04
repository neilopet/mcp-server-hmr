/**
 * DI Test Runner for Large Response Handler
 * 
 * This file manually executes the DI-based test suite by creating
 * an instance and calling setupTests to define Jest tests.
 */

import 'reflect-metadata';
import { jest, beforeEach } from '@jest/globals';
import { LargeResponseHandlerTestSuite } from '../../src/extensions/large-response-handler/tests/index.js';
import { createMockMCPMon } from '../../src/testing/MockMCPMon.js';
import LargeResponseHandlerExtension from '../../src/extensions/large-response-handler/index.js';
import type { MockMCPMon } from '../../src/testing/types.js';
import type { TestHarness } from '../../src/testing/types.js';

// Simple mock implementations for DI dependencies
const mockMCPMon: MockMCPMon = createMockMCPMon();

const mockTestHarness: TestHarness = {
  initialize: jest.fn(async (extensions: any[]) => undefined) as any,
  enableExtension: jest.fn(async (extensionId: string) => undefined) as any,
  disableExtension: jest.fn(async (extensionId: string) => undefined) as any,
  withExtension: jest.fn(async (extensionId: string, test: () => Promise<any>) => test()) as any,
  sendRequest: jest.fn(async (request: any) => ({ jsonrpc: '2.0' as const, id: 'test', result: {} })) as any,
  expectNotification: jest.fn(async (method: string, timeout?: number) => ({ jsonrpc: '2.0' as const, method: 'test', params: {} })) as any,
  callTool: jest.fn(async (toolName: string, args: any, progressToken?: string) => ({})) as any,
  streamResponse: jest.fn(async (chunks: any[], progressToken?: string) => undefined) as any,
  getProxy: jest.fn(() => ({} as any)) as any,
  verifyExtensionState: jest.fn((extensionId: string, expectedState: string) => undefined) as any,
  cleanup: jest.fn(async () => undefined) as any
};

const mockLRHUtilities = {
  createLargeResponse: jest.fn((sizeKB: number) => ({ data: 'x'.repeat(sizeKB * 1024) })),
  createStreamingChunks: jest.fn((count: number, chunkSize: number) => 
    Array.from({ length: count }, (_, i) => ({
      data: Array.from({ length: chunkSize }, (_, j) => i * chunkSize + j)
    }))),
  simulateProgressToken: jest.fn(() => `progress-123`),
  mockDuckDBQuery: jest.fn(),
  mockDatasetListing: jest.fn(),
  createMockDataset: jest.fn((options?: any) => ({
    status: 'success',
    originalTool: options?.tool || 'test-tool',
    count: options?.itemCount || 100,
    dataFile: 'mock-data.json',
    database: {
      path: 'mock.db',
      tables: [{
        name: 'mock_table',
        rowCount: options?.itemCount || 100,
        columns: [{
          table_name: 'mock_table',
          column_name: 'id',
          data_type: 'INTEGER'
        }]
      }],
      sampleQueries: ['SELECT * FROM mock_table']
    },
    metadata: {
      sizeKB: options?.sizeKB || 1024,
      estimatedTokens: (options?.sizeKB || 1024) * 200,
      timestamp: options?.timestamp || Date.now(),
      sessionId: options?.sessionId || 'test-session'
    }
  })),
  formatBytes: jest.fn((bytes: number) => `${bytes} bytes`)
};

// Add mock cleanup for each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Create test suite instance directly (bypassing DI for now)
const testSuite = new (class extends LargeResponseHandlerTestSuite {
  constructor() {
    super(mockMCPMon, mockTestHarness, mockLRHUtilities);
  }
})();

// Execute the test suite - call synchronously for Jest test discovery
testSuite.setupTests();