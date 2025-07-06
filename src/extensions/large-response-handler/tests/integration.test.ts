/**
 * Integration tests for Large Response Handler with MCPMonTestHarness
 * 
 * TODO: Remove this standalone integration test file once the DI test runner
 * (tests/extensions/large-response-handler-di.test.ts) is fully functional.
 * This file exists as a temporary working baseline to prove integration
 * functionality while the DI framework integration tests are being fixed.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPMonTestHarness } from '../../../testing/MCPMonTestHarness.js';
import LargeResponseHandlerExtension from '../index.js';
import { createLargeResponse, createStreamingChunks } from './unit.test.js';

describe('Large Response Handler - Integration Tests', () => {
  let testHarness: MCPMonTestHarness;
  let extension: LargeResponseHandlerExtension;

  beforeEach(async () => {
    testHarness = new MCPMonTestHarness();
    extension = new LargeResponseHandlerExtension();
    await testHarness.initialize([extension]);
    await testHarness.enableExtension('large-response-handler');
  });

  afterEach(async () => {
    await testHarness.cleanup();
  });

  describe('integration scenarios', () => {
    it('should handle complete large response workflow', async () => {
      await testHarness.withExtension('large-response-handler', async () => {
        // Simulate large tool response
        const progressToken = `progress-${Date.now()}`;
        
        // Call a tool with "large" in the name to trigger streaming simulation
        const resultPromise = testHarness.callTool(
          'test-large-tool',
          { data: 'request' },
          progressToken
        );

        // Should receive progress notifications
        const notification = await testHarness.expectNotification(
          'notifications/progress',
          1000
        );

        expect(notification).toBeDefined();
        expect(notification.params).toBeDefined();
        expect(notification.params).toMatchObject({
          progressToken: expect.any(String),
          progress: expect.any(Number)
        });
        
        // Wait for the result
        const result = await resultPromise;
        
        // Verify we got a result
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });
    });

    it('should handle streaming with real proxy', async () => {
      const chunks = createStreamingChunks(50, 25);
      const progressToken = `progress-${Date.now()}`;

      await testHarness.streamResponse(chunks, progressToken);

      // Verify streaming was handled correctly
      const proxy = testHarness.getProxy();
      expect(proxy).toBeDefined();
      testHarness.verifyExtensionState('large-response-handler', 'initialized');
    });

    it('should track progress tokens from requests', async () => {
      const progressToken = `progress-${Date.now()}`;
      
      // Call a tool with progress token
      await testHarness.callTool(
        'test-streaming-tool',
        { data: 'test' },
        progressToken
      );

      // Should have received progress notifications
      const notification = await testHarness.expectNotification(
        'notifications/progress',
        1000
      );

      expect(notification.params.progressToken).toBe(progressToken);
    });
  });
});