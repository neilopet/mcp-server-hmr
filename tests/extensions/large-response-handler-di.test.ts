/**
 * DI Test Runner for Large Response Handler
 * 
 * This file manually executes the DI-based test suite by creating
 * an instance and calling setupTests to define Jest tests.
 */

import 'reflect-metadata';
import { LargeResponseHandlerTestSuite } from '../../src/extensions/large-response-handler/tests/index.js';
import { createMockMCPMon } from '../../src/testing/MockMCPMon.js';
import type { MockMCPMon } from '../../src/testing/types.js';
import type { TestHarness } from '../../src/testing/types.js';

// Simple mock implementations for DI dependencies
const mockMCPMon: MockMCPMon = createMockMCPMon();

const mockTestHarness: TestHarness = {
  initialize: async () => {},
  enableExtension: async () => {},
  disableExtension: async () => {},
  withExtension: async (id, test) => test(),
  sendRequest: async () => ({ jsonrpc: '2.0' as const, id: 'test', result: {} }),
  expectNotification: async () => ({ jsonrpc: '2.0' as const, method: 'test', params: {} }),
  callTool: async () => ({}),
  streamResponse: async () => {},
  getProxy: () => ({} as any),
  verifyExtensionState: () => {},
  cleanup: async () => {}
};

const mockLRHUtilities = {
  createLargeResponse: (sizeKB: number) => ({ data: 'x'.repeat(sizeKB * 1024) }),
  createStreamingChunks: (count: number, chunkSize: number) => 
    Array.from({ length: count }, (_, i) => ({
      data: Array.from({ length: chunkSize }, (_, j) => i * chunkSize + j)
    })),
  simulateProgressToken: () => `progress-${Math.random().toString(36).substr(2, 9)}`,
  mockDuckDBQuery: () => {},
  mockDatasetListing: () => {},
  createMockDataset: (options?: any) => ({
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
  }),
  formatBytes: (bytes: number) => `${bytes} bytes`
};

// Create test suite instance directly (bypassing DI for now)
const testSuite = new (class extends LargeResponseHandlerTestSuite {
  constructor() {
    super(mockMCPMon, mockTestHarness, mockLRHUtilities);
  }
})();

// Execute the test suite
testSuite.setupTests().then(() => {
  console.log('DI Test suite setup completed');
}).catch(error => {
  console.error('DI Test suite setup failed:', error);
});