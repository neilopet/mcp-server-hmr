/**
 * Jest global setup file for test isolation
 * 
 * Provides automatic cleanup after each test to prevent state leakage
 * between tests in the mcpmon test suite.
 */

import { afterEach } from '@jest/globals';
import { TestContainer } from './src/testing/TestContainer.js';

// Global afterEach cleanup to prevent test state leakage
afterEach(() => {
  TestContainer.getInstance().reset();
});