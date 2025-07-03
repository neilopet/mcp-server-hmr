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
  createMockDataset: (rows: number, cols: number) => 
    Array(rows).fill(null).map(() => Array(cols).fill('data')),
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