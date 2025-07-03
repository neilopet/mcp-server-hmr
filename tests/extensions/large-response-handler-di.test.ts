/**
 * DI Test Runner for Large Response Handler
 * 
 * This file manually executes the DI-based test suite by creating
 * an instance and calling setupTests to define Jest tests.
 */

import 'reflect-metadata';
import { LargeResponseHandlerTestSuite } from '../../src/extensions/large-response-handler/tests/index.js';
import { createMockMCPMon } from '../../src/testing/MockMCPMon.js';
import type { MockMCPMon, TestHarness } from '../../src/testing/types.js';

// Simple mock implementations for DI dependencies
const mockMCPMon: MockMCPMon = createMockMCPMon();

const mockTestHarness: TestHarness = {
  initialize: async () => {},
  enableExtension: async () => {},
  disableExtension: async () => {},
  withExtension: async (id, test) => test(),
  sendRequest: async () => ({ id: 'test', result: {} }),
  expectNotification: async () => ({ method: 'test', params: {} }),
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
  mockDatasetListing: () => {}
};

// Create test suite instance directly (bypassing DI for now)
const testSuite = new (class extends LargeResponseHandlerTestSuite {
  constructor() {
    super();
    // Set mock dependencies
    (this as any).mockMCPMon = mockMCPMon;
    (this as any).testHarness = mockTestHarness;
    (this as any).lrhUtils = mockLRHUtilities;
  }
})();

// Execute the test suite
testSuite.setupTests().then(() => {
  console.log('DI Test suite setup completed');
}).catch(error => {
  console.error('DI Test suite setup failed:', error);
});