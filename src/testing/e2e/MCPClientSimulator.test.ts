/**
 * Test file demonstrating E2E MCP Client Simulator usage
 * 
 * This file serves as both tests and documentation for the E2E testing framework.
 * It shows how to use different client simulators, create scenarios, and test
 * complex MCP protocol interactions.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  E2ETestContextFactory,
  E2EScenarioBuilder,
  ClaudeDesktopSimulator,
  MCPInspectorSimulator,
  CustomClientSimulator,
  MockMCPStream,
  NetworkMCPStream,
  type E2ETestContext,
  type MCPClientSimulator,
  type E2EScenario,
} from './MCPClientSimulator.js';

describe('E2E MCP Client Simulator', () => {
  let context: E2ETestContext;
  let mockStream: MockMCPStream;

  beforeEach(() => {
    mockStream = new MockMCPStream();
    context = E2ETestContextFactory.createCustomContext(() => mockStream);
  });

  afterEach(async () => {
    // Cleanup any open connections
    if (mockStream) {
      await mockStream.close();
    }
  });

  describe('Client Simulators', () => {
    it('should create Claude Desktop simulator with correct characteristics', () => {
      const client = context.simulateClient('claude-desktop');
      expect(client).toBeInstanceOf(ClaudeDesktopSimulator);
    });

    it('should create MCP Inspector simulator with correct characteristics', () => {
      const client = context.simulateClient('mcp-inspector');
      expect(client).toBeInstanceOf(MCPInspectorSimulator);
    });

    it('should create custom client with provided configuration', () => {
      const config = {
        name: 'test-client',
        version: '1.2.3',
        initializationDelay: 500,
        responseTimeout: 10000,
        capabilities: {
          experimental: { testFeature: { enabled: true } },
        },
      };

      const client = context.createCustomClient(config);
      expect(client).toBeInstanceOf(CustomClientSimulator);
    });
  });

  describe('Connection Flow', () => {
    let client: MCPClientSimulator;

    beforeEach(() => {
      client = context.simulateClient('claude-desktop');
    });

    afterEach(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should complete full connection and initialization flow', async () => {
      // Connect
      await client.connect();

      // Initialize with capabilities
      await client.initialize({
        experimental: {},
        sampling: {},
        roots: { listChanged: true },
      });

      // Verify client is ready for operations
      expect(client.getNotifications()).toEqual([]);
    });

    it('should handle initialization errors gracefully', async () => {
      await client.connect();

      // Simulate server error during initialization
      mockStream.simulateError(new Error('Server initialization failed'));

      // Should handle error without crashing
      await expect(client.initialize()).rejects.toThrow();
    });
  });

  describe('Tool Operations', () => {
    let client: MCPClientSimulator;

    beforeEach(async () => {
      client = context.simulateClient('claude-desktop');
      await client.connect();
      await client.initialize();
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should list available tools', async () => {
      const tools = await client.listTools();
      expect(Array.isArray(tools)).toBe(true);
      
      // Should have at least one mock tool
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('inputSchema');
    });

    it('should call tools with arguments', async () => {
      const result = await client.callTool('test-tool', {
        input: 'test input',
        options: { verbose: true },
      });

      expect(result).toBeDefined();
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'Mock tool response',
        },
      ]);
    });

    it('should handle tool calls with progress tokens', async () => {
      const progressToken = 'progress-123';
      
      await client.callTool('test-tool', { input: 'test' }, progressToken);

      // In a real implementation, we'd verify progress notifications
      const progressNotifications = client.getProgressNotifications(progressToken);
      expect(Array.isArray(progressNotifications)).toBe(true);
    });
  });

  describe('Progress Tracking', () => {
    let client: MCPClientSimulator;

    beforeEach(async () => {
      client = context.simulateClient('mcp-inspector');
      await client.connect();
      await client.initialize();
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should track progress notifications by token', async () => {
      const progressToken = 'test-progress-456';

      // Simulate progress notifications
      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: 50,
          total: 100,
          message: 'Processing...',
        },
      }));

      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: 100,
          total: 100,
          message: 'Complete',
        },
      }));

      // Wait for notifications to be processed
      await new Promise(resolve => setTimeout(resolve, 50));

      const progressNotifications = client.getProgressNotifications(progressToken);
      expect(progressNotifications).toHaveLength(2);
      expect(progressNotifications[0].params.progress).toBe(50);
      expect(progressNotifications[1].params.progress).toBe(100);
    });
  });

  describe('Error Handling', () => {
    let client: MCPClientSimulator;

    beforeEach(() => {
      client = context.simulateClient('claude-desktop');
    });

    afterEach(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should handle connection failures', async () => {
      // Simulate connection failure
      mockStream.simulateError(new Error('Connection refused'));

      await expect(client.connect()).rejects.toThrow();
    });

    it('should handle tool call timeouts', async () => {
      const customClient = context.createCustomClient({
        name: 'timeout-client',
        version: '1.0.0',
        responseTimeout: 100, // Very short timeout
      });

      await customClient.connect();
      await customClient.initialize();

      // Tool call should timeout
      await expect(
        customClient.callTool('slow-tool', {})
      ).rejects.toThrow('timeout');

      await customClient.disconnect();
    });
  });

  describe('Client-Specific Behaviors', () => {
    it('should demonstrate Claude Desktop retry behavior', async () => {
      const client = context.simulateClient('claude-desktop') as ClaudeDesktopSimulator;
      await client.connect();
      await client.initialize();

      // Simulate server failures that trigger retries
      let callCount = 0;
      const originalSendRequest = (client as any).sendRequest;
      (client as any).sendRequest = async function(request: any) {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return originalSendRequest.call(this, request);
      };

      // Should retry and eventually succeed
      const result = await client.callTool('test-tool', {});
      expect(result).toBeDefined();
      expect(callCount).toBe(3); // Should have retried twice

      await client.disconnect();
    });

    it('should demonstrate MCP Inspector validation', async () => {
      const client = context.simulateClient('mcp-inspector') as MCPInspectorSimulator;
      await client.connect();
      await client.initialize();

      // Should validate protocol compliance
      const isValid = await client.validateProtocol();
      expect(typeof isValid).toBe('boolean');

      await client.disconnect();
    });

    it('should demonstrate custom client behaviors', async () => {
      const client = context.createCustomClient({
        name: 'custom-client',
        version: '1.0.0',
      }) as CustomClientSimulator;

      // Add custom behavior
      client.addCustomBehavior('customOperation', async (param: string) => {
        return `Custom result for: ${param}`;
      });

      await client.connect();
      await client.initialize();

      // Execute custom behavior
      const result = await client.executeCustomBehavior('customOperation', 'test-param');
      expect(result).toBe('Custom result for: test-param');

      await client.disconnect();
    });
  });

  describe('Scenario Builder', () => {
    it('should build complex E2E scenarios', () => {
      const scenario = new E2EScenarioBuilder('Complex Test Scenario')
        .connect(100)
        .initialize({
          experimental: {},
          sampling: {},
        }, 200)
        .callTool('list-files', { directory: '/test' })
        .wait(500)
        .callTool('read-file', { path: '/test/file.txt' }, 'progress-token-1')
        .expectNotification('tools/list_changed')
        .expectResponse({ success: true })
        .disconnect()
        .build();

      expect(scenario.name).toBe('Complex Test Scenario');
      expect(scenario.steps).toHaveLength(6);
      expect(scenario.assertions).toHaveLength(2);

      // Verify step structure
      expect(scenario.steps[0].action).toBe('connect');
      expect(scenario.steps[0].delay).toBe(100);
      
      expect(scenario.steps[1].action).toBe('initialize');
      expect(scenario.steps[1].params?.capabilities).toBeDefined();
      
      expect(scenario.steps[2].action).toBe('callTool');
      expect(scenario.steps[2].params?.name).toBe('list-files');
    });

    it('should execute scenarios and return results', async () => {
      const scenario = new E2EScenarioBuilder('Simple Scenario')
        .connect()
        .initialize()
        .callTool('test-tool', { input: 'test' })
        .disconnect()
        .build();

      const result = await context.runScenario(scenario);

      expect(result.success).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.capturedMessages)).toBe(true);
    });
  });

  describe('Stream Communication', () => {
    it('should handle mock stream communication', async () => {
      const stream = new MockMCPStream();
      let receivedMessage: string | null = null;

      stream.onMessage((message) => {
        receivedMessage = message;
      });

      await stream.write('{"test": "message"}');
      stream.simulateMessage('{"response": "data"}');

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(receivedMessage).toBe('{"response": "data"}');

      await stream.close();
    });

    it('should handle stream errors gracefully', async () => {
      const stream = new MockMCPStream();
      let receivedError: Error | null = null;

      stream.onError((error) => {
        receivedError = error;
      });

      const testError = new Error('Test stream error');
      stream.simulateError(testError);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(receivedError).toBe(testError);

      await stream.close();
    });

    it('should handle stream close events', async () => {
      const stream = new MockMCPStream();
      let closed = false;

      stream.onClose(() => {
        closed = true;
      });

      await stream.close();
      expect(closed).toBe(true);
    });
  });

  describe('Message Capture and Verification', () => {
    let client: MCPClientSimulator;

    beforeEach(async () => {
      client = context.simulateClient('mcp-inspector');
      await client.connect();
      await client.initialize();
    });

    afterEach(async () => {
      await client.disconnect();
    });

    it('should capture all notifications', async () => {
      // Simulate various notifications
      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list_changed',
        params: { tools: [] },
      }));

      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'test-token',
          progress: 25,
          total: 100,
        },
      }));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      const notifications = client.getNotifications();
      expect(notifications).toHaveLength(2);
      expect(notifications[0].method).toBe('tools/list_changed');
      expect(notifications[1].method).toBe('notifications/progress');
    });

    it('should filter progress notifications by token', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';

      // Simulate progress for different tokens
      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: token1, progress: 10 },
      }));

      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: token2, progress: 20 },
      }));

      mockStream.simulateMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: token1, progress: 30 },
      }));

      await new Promise(resolve => setTimeout(resolve, 50));

      const token1Progress = client.getProgressNotifications(token1);
      const token2Progress = client.getProgressNotifications(token2);

      expect(token1Progress).toHaveLength(2);
      expect(token2Progress).toHaveLength(1);
      expect(token1Progress[0].params.progress).toBe(10);
      expect(token1Progress[1].params.progress).toBe(30);
      expect(token2Progress[0].params.progress).toBe(20);
    });
  });

  describe('Integration with Test Framework', () => {
    it('should integrate with existing test harness', async () => {
      // This demonstrates how the E2E simulator integrates with the broader test framework
      const scenario = new E2EScenarioBuilder('Integration Test')
        .connect()
        .initialize()
        .callTool('integration-tool', { test: true })
        .expectNotification('tools/list_changed')
        .disconnect()
        .build();

      const result = await context.runScenario(scenario);
      
      // Results should be compatible with existing test reporting
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('capturedMessages');
      
      // Can be used in larger test suites
      expect(typeof result.success).toBe('boolean');
    });
  });
});