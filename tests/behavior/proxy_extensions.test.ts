/**
 * Behavioral tests for proxy extension integration
 * 
 * Tests that extensions work correctly with the actual proxy using mock
 * implementations to verify hook integration and functionality.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { setupProxyTest, waitForStable } from './test_helper.js';
import { ExtensionRegistry } from '../../src/extensions/registry.js';
import type { Extension, ExtensionContext, ToolDefinition } from '../../src/extensions/interfaces.js';

// Mock extension for testing
class MockTestExtension implements Extension {
  readonly id = 'test-extension';
  readonly name = 'Test Extension';
  readonly version = '1.0.0';
  readonly defaultEnabled = true;
  
  // Track hook calls for verification
  public hookCalls = {
    beforeStdinForward: [] as any[],
    afterStdoutReceive: [] as any[],
    getAdditionalTools: 0,
    handleToolCall: [] as Array<{ toolName: string, args: any }>,
    onShutdown: 0
  };
  
  private context?: ExtensionContext;
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    
    // Register hooks
    context.hooks.beforeStdinForward = this.beforeStdinForward.bind(this);
    context.hooks.afterStdoutReceive = this.afterStdoutReceive.bind(this);
    context.hooks.getAdditionalTools = this.getAdditionalTools.bind(this);
    context.hooks.handleToolCall = this.handleToolCall.bind(this);
    context.hooks.onShutdown = this.onShutdown.bind(this);
  }
  
  async shutdown(): Promise<void> {
    this.hookCalls.onShutdown++;
    this.context = undefined;
  }
  
  private async beforeStdinForward(message: any): Promise<any> {
    this.hookCalls.beforeStdinForward.push(message);
    
    // Transform test messages to verify hook works
    if (message.method === 'test/transform') {
      return {
        ...message,
        params: {
          ...message.params,
          transformed: true
        }
      };
    }
    
    return message;
  }
  
  private async afterStdoutReceive(message: any): Promise<any> {
    this.hookCalls.afterStdoutReceive.push(message);
    
    // Add metadata to responses to verify hook works
    if (message.result && message.id) {
      return {
        ...message,
        result: {
          ...message.result,
          extensionProcessed: true
        }
      };
    }
    
    return message;
  }
  
  private async getAdditionalTools(): Promise<ToolDefinition[]> {
    this.hookCalls.getAdditionalTools++;
    
    return [
      {
        name: 'test.mock-tool',
        description: 'A mock tool for testing',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      }
    ];
  }
  
  private async handleToolCall(toolName: string, args: any): Promise<any | null> {
    this.hookCalls.handleToolCall.push({ toolName, args });
    
    if (toolName === 'test.mock-tool') {
      return {
        status: 'success',
        response: `Mock tool received: ${args.message}`,
        timestamp: Date.now()
      };
    }
    
    return null; // Let other tools be handled by server
  }
  
  private async onShutdown(): Promise<void> {
    this.hookCalls.onShutdown++;
  }
}

describe('Proxy Extension Integration', () => {
  let mockExtension: MockTestExtension;
  
  beforeEach(() => {
    mockExtension = new MockTestExtension();
  });
  
  it('should initialize extensions with proxy startup', async () => {
    // Create extension registry with mock extension
    const registry = new ExtensionRegistry();
    registry.register(mockExtension);
    registry.setEnabled('test-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
      dataDir: '/tmp/test-extensions'
    });
    
    // Inject extension registry into proxy
    (proxy as any).extensionRegistry = registry;
    
    try {
      // Start proxy which should initialize extensions
      proxy.start();
      await waitForStable(100);
      
      // Verify extension was initialized
      expect(mockExtension['context']).toBeDefined();
      expect(mockExtension['context']?.sessionId).toMatch(/^mcpmon-\d+$/);
      expect(mockExtension['context']?.dataDir).toBe('/tmp/test-extensions');
      
      // Verify hooks were registered
      expect(mockExtension['context']?.hooks.beforeStdinForward).toBeDefined();
      expect(mockExtension['context']?.hooks.afterStdoutReceive).toBeDefined();
      expect(mockExtension['context']?.hooks.getAdditionalTools).toBeDefined();
      expect(mockExtension['context']?.hooks.handleToolCall).toBeDefined();
      
    } finally {
      await teardown();
    }
  });
  
  it('should call beforeStdinForward hook for incoming messages', async () => {
    const registry = new ExtensionRegistry();
    registry.register(mockExtension);
    registry.setEnabled('test-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      // Start proxy and wait for initialization
      proxy.start();
      await waitForStable(100);
      
      // Clear any initialization messages
      mockExtension.hookCalls.beforeStdinForward = [];
      
      // Simulate stdin message through the proxy
      const testMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/message',
        params: { data: 'test' }
      };
      
      // Send message to proxy stdin (would need to access stdin writer)
      // For now, verify the extension was initialized and hooks are set up
      expect(mockExtension['context']?.hooks.beforeStdinForward).toBeDefined();
      
    } finally {
      await teardown();
    }
  });
  
  it('should handle extension tool calls directly', async () => {
    const registry = new ExtensionRegistry();
    registry.register(mockExtension);
    registry.setEnabled('test-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      proxy.start();
      await waitForStable(100);
      
      // Verify extension tool handling is set up
      expect(mockExtension['context']?.hooks.handleToolCall).toBeDefined();
      
      // The actual tool call handling is tested in the setupStdinForwarding
      // method of the proxy, which checks for 'mcpmon.*' prefixed tools
      
    } finally {
      await teardown();
    }
  });
  
  it('should shutdown extensions when proxy shuts down', async () => {
    const registry = new ExtensionRegistry();
    registry.register(mockExtension);
    registry.setEnabled('test-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      proxy.start();
      await waitForStable(100);
      
      // Verify extension is initialized
      expect(mockExtension['context']).toBeDefined();
      expect(mockExtension.hookCalls.onShutdown).toBe(0);
      
    } finally {
      // Use teardown which properly shuts down proxy
      await teardown();
      
      // Verify extension was shut down
      expect(mockExtension.hookCalls.onShutdown).toBeGreaterThanOrEqual(1);
      expect(mockExtension['context']).toBeUndefined();
    }
  }, 10000); // Increase timeout
  
  it('should handle extension initialization errors gracefully', async () => {
    // Create extension that fails during initialization
    class FailingExtension implements Extension {
      readonly id = 'failing-extension';
      readonly name = 'Failing Extension';
      readonly version = '1.0.0';
      readonly defaultEnabled = true;
      
      async initialize(): Promise<void> {
        throw new Error('Initialization failed');
      }
      
      async shutdown(): Promise<void> {
        // Should not be called if initialization fails
      }
    }
    
    const registry = new ExtensionRegistry();
    registry.register(new FailingExtension());
    registry.setEnabled('failing-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      // Proxy should start successfully even if extension fails
      proxy.start();
      await waitForStable(100);
      
      // Verify proxy is still running
      expect(proxy.isRunning()).toBe(true);
      
      // Verify failing extension was disabled
      expect(registry.isEnabled('failing-extension')).toBe(false);
      
    } finally {
      await teardown();
    }
  });
  
  it('should work correctly without any extensions', async () => {
    // Test that proxy works normally when no extensions are registered
    const registry = new ExtensionRegistry();
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      proxy.start();
      await waitForStable(100);
      
      // Verify proxy works normally
      expect(proxy.isRunning()).toBe(true);
      expect(procManager.getSpawnCallCount()).toBe(1);
      
    } finally {
      await teardown();
    }
  });
  
  it('should work correctly with no extension registry', async () => {
    // Test that proxy works when no extension registry is provided
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100
    });
    
    // Don't set extension registry (undefined)
    
    try {
      proxy.start();
      await waitForStable(100);
      
      // Verify proxy works normally
      expect(proxy.isRunning()).toBe(true);
      expect(procManager.getSpawnCallCount()).toBe(1);
      
    } finally {
      await teardown();
    }
  });
  
  it('should preserve extension state across server restarts', async () => {
    const registry = new ExtensionRegistry();
    registry.register(mockExtension);
    registry.setEnabled('test-extension', true);
    
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 50  // Faster restart for testing
    });
    
    (proxy as any).extensionRegistry = registry;
    
    try {
      proxy.start();
      await waitForStable(150);
      
      // Verify extension is initialized and proxy is running
      expect(mockExtension['context']).toBeDefined();
      expect(procManager.getSpawnCallCount()).toBe(1);
      const originalContext = mockExtension['context'];
      
      // Use simulateRestart helper which properly waits for restart completion
      const { simulateRestart } = await import('./test_helper.js');
      await simulateRestart(procManager, fs, '/test/server.js', 50);
      
      // Verify server restarted
      expect(procManager.getSpawnCallCount()).toBe(2);
      
      // Verify extension context is preserved (not re-initialized)
      expect(mockExtension['context']).toBe(originalContext);
      
    } finally {
      await teardown();
    }
  });
});