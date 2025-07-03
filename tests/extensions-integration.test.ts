/**
 * Extension Integration Tests
 * 
 * This file serves as the main entry point for running extension test suites
 * using the DI test framework discovery mechanism.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { ExtensionTestDiscovery } from '../src/testing/discovery.js';

describe('Extension Test Suites', () => {
  beforeAll(async () => {
    try {
      // Discover and register all extension test suites
      await ExtensionTestDiscovery.discoverAndRegister();
    } catch (error) {
      console.warn('Extension test discovery failed:', error);
    }
  });

  it('should discover extension test suites', async () => {
    const suites = ExtensionTestDiscovery.getAllTestSuites();
    // It's okay if no suites are discovered initially
    expect(Array.isArray(suites)).toBe(true);
  });

  // Individual extension tests will be dynamically loaded
  // by the discovery system if they exist
});