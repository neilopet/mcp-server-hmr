# MCPMon DI Test Framework

A comprehensive dependency injection-based testing framework for MCPMon extensions. This framework provides unit testing with mocks, integration testing with real proxy infrastructure, and end-to-end testing with client simulation.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Testing Patterns](#testing-patterns)
- [Best Practices](#best-practices)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Migration Guide](#migration-guide)

## Overview

### Architecture

The MCPMon test framework is built around dependency injection and provides four levels of testing:

1. **Unit Tests**: Fast, isolated tests using `MockMCPMon` with no external dependencies
2. **Integration Tests**: Real proxy testing using `TestHarness` with mocked external services
3. **Soak Tests**: Persistent system testing with real components (NEW - Production Ready ✅)
4. **E2E Tests**: Full client simulation with real network communication

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                         TestContainer (DI)                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│  Unit Tests      │  Integration Tests  │  Soak Tests      │  E2E Tests       │
│  MockMCPMon     │  TestHarness        │  TestHarness     │  E2ETestContext  │
│  MockContext    │  Real MCPProxy      │  Real MCPProxy   │  ClientSimulator │
│  Isolated       │  Controlled         │  Persistent      │  Full Stack      │
│  beforeEach     │  beforeEach         │  beforeAll       │  Real Network    │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Core Components

- **TestContainer**: DI container for test dependencies and suite registration
- **MockMCPMon**: Controllable mock for unit testing extensions
- **TestHarness**: Integration test environment with real proxy
- **E2ETestContext**: End-to-end testing with client simulation
- **ExtensionTestDiscovery**: Automatic test suite discovery and loading

### Test Registration

The framework uses the `@TestContainer.register` decorator for automatic test suite discovery:

```typescript
@TestContainer.register('my-extension')
class MyExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'my-extension';
  
  async setupTests(): Promise<void> {
    // Initialize test suite
  }
  
  async teardownTests(): Promise<void> {
    // Clean up test suite
  }
}
```

## Quick Start

### 1. Set Up Testing

The testing framework is included with mcpmon. No additional installation needed.

### 2. Create Extension Test Suite

Create `src/extensions/my-extension/tests/index.ts`:

```typescript
import { TestContainer, MockMCPMon, createMockMCPMon } from '../../../testing/index.js';
import type { ExtensionTestSuite } from '../../../testing/types.js';
import { MyExtension } from '../index.js';

@TestContainer.register('my-extension')
export class MyExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'my-extension';
  
  private extension: MyExtension;
  private mockMCPMon: MockMCPMon;
  
  async setupTests(): Promise<void> {
    this.extension = new MyExtension();
    this.mockMCPMon = createMockMCPMon();
  }
  
  async teardownTests(): Promise<void> {
    await this.extension.shutdown();
    this.mockMCPMon.reset();
  }
  
  // Unit tests
  async testBasicInitialization(): Promise<void> {
    const context = this.mockMCPMon.createContext({
      config: { enabled: true }
    });
    
    await this.extension.initialize(context);
    
    // Verify hook registration
    this.mockMCPMon.expectHookRegistered('beforeStdinForward');
    this.mockMCPMon.expectHookRegistered('afterStdoutReceive');
  }
  
  async testToolHandling(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate tool call
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: { name: 'my-tool', arguments: { input: 'test' } }
    };
    
    const response = await this.mockMCPMon.simulateRequest(request);
    
    // Verify response
    expect(response.result).toEqual({ output: 'processed: test' });
  }
}
```

### 3. Run Tests

```bash
# Discover and run all extension tests
npx mcpmon test

# Run specific extension tests
npx mcpmon test --extension my-extension

# Run with filtering
npx mcpmon test --tags unit,integration --parallel
```

## API Reference

### TestContainer

Central DI container for test dependencies and suite registration.

#### Static Methods

```typescript
class TestContainer {
  // Register test suite with DI container
  static register(extensionId: string): ClassDecorator
  
  // Get singleton instance
  static getInstance(): TestContainer
  
  // Get underlying Inversify container
  static getContainer(): Container
}
```

#### Instance Methods

```typescript
interface TestContainer {
  // Retrieve specific test suite
  getTestSuite(extensionId: string): ExtensionTestSuite | undefined
  
  // Get all registered test suites
  getAllTestSuites(): ExtensionTestSuite[]
  
  // Bind core test utilities
  bindTestUtilities(): void
  
  // Load container module
  loadModule(module: ContainerModule): void
  
  // Reset container (for test isolation)
  reset(): void
  
  // Get service from container
  get<T>(serviceIdentifier: symbol | string): T
  
  // Check if service is bound
  isBound(serviceIdentifier: symbol | string): boolean
  
  // Create child container
  createChildContainer(): Container
}
```

### MockMCPMon

Controllable mock environment for unit testing extensions.

```typescript
interface MockMCPMon {
  // Create mock extension context
  createContext(options?: MockContextOptions): MockExtensionContext
  
  // Simulate incoming request
  simulateRequest(request: MCPRequest): Promise<MCPResponse>
  
  // Simulate incoming response
  simulateResponse(response: MCPResponse): Promise<MCPResponse>
  
  // Simulate notification
  simulateNotification(notification: MCPNotification): Promise<void>
  
  // Get captured messages
  getCapturedMessages(): CapturedMessage[]
  
  // Verification methods
  expectHookRegistered(hookName: keyof ExtensionHooks): void
  expectToolRegistered(toolName: string): void
  
  // Get registered components
  getRegisteredHooks(): Partial<ExtensionHooks>
  getProgressNotifications(): ProgressNotification[]
  
  // Reset all captured data
  reset(): void
}
```

#### MockExtensionContext

Extended extension context with test helpers:

```typescript
interface MockExtensionContext extends ExtensionContext {
  testHelpers: {
    // Manually trigger hooks for testing
    triggerHook(hookName: keyof ExtensionHooks, ...args: any[]): Promise<any>
    
    // Get all calls made to a hook
    getHookCalls(hookName: keyof ExtensionHooks): any[]
  }
}
```

### TestHarness

Integration test environment with real MCPProxy infrastructure.

```typescript
interface TestHarness {
  // Initialize with extensions
  initialize(extensions: Extension[]): Promise<void>
  
  // Extension management
  enableExtension(extensionId: string): Promise<void>
  disableExtension(extensionId: string): Promise<void>
  withExtension<T>(extensionId: string, test: () => Promise<T>): Promise<T>
  
  // MCP communication
  sendRequest(request: MCPRequest): Promise<MCPResponse>
  expectNotification(method: string, timeout?: number): Promise<MCPNotification>
  
  // Tool simulation
  callTool(toolName: string, args: any, progressToken?: string): Promise<any>
  streamResponse(chunks: any[], progressToken?: string): Promise<void>
  
  // Verification
  verifyExtensionState(extensionId: string, state: 'initialized' | 'shutdown'): void
  getProxy(): MCPProxy
  
  // Cleanup
  cleanup(): Promise<void>
}
```

### E2ETestContext

End-to-end testing with client simulation.

```typescript
interface E2ETestContext {
  // Client simulation
  simulateClient(clientType: 'claude-desktop' | 'mcp-inspector' | 'custom'): MCPClientSimulator
  createCustomClient(config: ClientConfig): MCPClientSimulator
  
  // Scenario testing
  runScenario(scenario: E2EScenario): Promise<ScenarioResult>
}

interface MCPClientSimulator {
  connect(): Promise<void>
  initialize(capabilities?: any): Promise<void>
  callTool(name: string, args: any, progressToken?: string): Promise<any>
  listTools(): Promise<any[]>
  disconnect(): Promise<void>
  getNotifications(): MCPNotification[]
}
```

### Factory Functions

Convenient factory functions for creating test components:

```typescript
// Create test suite with default configuration
function createTestSuite(
  name: string,
  tests: Record<string, (ctx: TestContext) => void | Promise<void>>
): TestSuite

// Create mock context
function createMockContext(options?: Partial<MockMCPMonOptions>): TestContext

// Helper for container lifecycle
function withTestContainer<T>(
  options: TestContainerOptions,
  fn: (container: TestContainer) => T | Promise<T>
): Promise<T>

// Register test suite for discovery
function registerTestSuite(
  suite: TestSuite,
  metadata?: Partial<TestSuite['metadata']>
): void
```

## Testing Patterns

### Unit Tests with MockMCPMon

Unit tests are fast, isolated tests that verify extension behavior without external dependencies.

```typescript
@TestContainer.register('message-interceptor')
export class MessageInterceptorTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'message-interceptor';
  
  private extension: MessageInterceptorExtension;
  private mockMCPMon: MockMCPMon;
  
  async setupTests(): Promise<void> {
    this.extension = new MessageInterceptorExtension();
    this.mockMCPMon = createMockMCPMon();
  }
  
  async teardownTests(): Promise<void> {
    await this.extension.shutdown();
    this.mockMCPMon.reset();
  }
  
  // Test hook registration
  async testHookRegistration(): Promise<void> {
    const context = this.mockMCPMon.createContext({
      config: { interceptPatterns: ['test/*'] }
    });
    
    await this.extension.initialize(context);
    
    // Verify hooks were registered
    this.mockMCPMon.expectHookRegistered('beforeStdinForward');
    this.mockMCPMon.expectHookRegistered('afterStdoutReceive');
    
    const hooks = this.mockMCPMon.getRegisteredHooks();
    expect(hooks.beforeStdinForward).toBeDefined();
    expect(hooks.afterStdoutReceive).toBeDefined();
  }
  
  // Test message interception
  async testMessageInterception(): Promise<void> {
    const context = this.mockMCPMon.createContext({
      config: { interceptPatterns: ['tools/call'] }
    });
    
    await this.extension.initialize(context);
    
    // Test request interception
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: { name: 'test-tool', arguments: { data: 'sensitive' } }
    };
    
    // Trigger hook manually
    const result = await context.testHelpers.triggerHook(
      'beforeStdinForward', 
      request
    );
    
    // Verify request was modified
    expect(result.params.arguments.data).toBe('[REDACTED]');
    
    // Check hook was called
    const hookCalls = context.testHelpers.getHookCalls('beforeStdinForward');
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0][0]).toEqual(request);
  }
  
  // Test progress notifications
  async testProgressHandling(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate progress notification
    const progressNotification = {
      jsonrpc: '2.0' as const,
      method: 'notifications/progress',
      params: {
        progressToken: 'test-123',
        progress: 50,
        total: 100,
        message: 'Processing...'
      }
    };
    
    await this.mockMCPMon.simulateNotification(progressNotification);
    
    // Verify progress was captured
    const notifications = this.mockMCPMon.getProgressNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].params.progress).toBe(50);
  }
  
  // Test error handling
  async testErrorHandling(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate request that causes error
    const badRequest = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'invalid/method',
      params: null
    };
    
    const response = await this.mockMCPMon.simulateRequest(badRequest);
    
    // Verify error response
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601); // Method not found
  }
}
```

### Integration Tests with TestHarness

Integration tests verify extension behavior in a controlled environment with real proxy infrastructure.

```typescript
import { TestHarness, MCPMonTestHarness } from '../../../testing/index.js';

describe('Tool Provider Integration Tests', () => {
  let harness: TestHarness;
  let toolProviderExtension: ToolProviderExtension;
  
  beforeEach(async () => {
    toolProviderExtension = new ToolProviderExtension();
    harness = new MCPMonTestHarness();
    
    // Initialize harness with extensions
    await harness.initialize([toolProviderExtension]);
  });
  
  afterEach(async () => {
    await harness.cleanup();
  });
  
  it('should register tools and handle calls', async () => {
    // Enable extension
    await harness.enableExtension('tool-provider');
    
    // Verify extension state
    harness.verifyExtensionState('tool-provider', 'initialized');
    
    // Request tool list
    const toolsResponse = await harness.sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    });
    
    expect(toolsResponse.result.tools).toContainEqual(
      expect.objectContaining({
        name: 'my-custom-tool',
        description: expect.any(String)
      })
    );
    
    // Call the tool
    const toolResult = await harness.callTool('my-custom-tool', {
      input: 'test data'
    });
    
    expect(toolResult.status).toBe('success');
    expect(toolResult.output).toBeDefined();
  });
  
  it('should handle tool calls with progress', async () => {
    await harness.enableExtension('tool-provider');
    
    const progressToken = 'progress-123';
    
    // Start tool call with progress
    const toolPromise = harness.callTool('long-running-tool', {
      data: 'large dataset'
    }, progressToken);
    
    // Wait for progress notification
    const progressNotification = await harness.expectNotification(
      'notifications/progress',
      5000
    );
    
    expect(progressNotification.params.progressToken).toBe(progressToken);
    expect(progressNotification.params.progress).toBeGreaterThan(0);
    
    // Wait for completion
    const result = await toolPromise;
    expect(result.status).toBe('success');
  });
  
  it('should handle extension enable/disable', async () => {
    // Test with extension temporarily enabled
    await harness.withExtension('tool-provider', async () => {
      const toolsResponse = await harness.sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      });
      
      expect(toolsResponse.result.tools).toContainEqual(
        expect.objectContaining({ name: 'my-custom-tool' })
      );
    });
    
    // Verify extension is disabled after test
    harness.verifyExtensionState('tool-provider', 'shutdown');
  });
  
  it('should handle streaming responses', async () => {
    await harness.enableExtension('tool-provider');
    
    const chunks = [
      { data: 'chunk1' },
      { data: 'chunk2' },
      { data: 'chunk3' }
    ];
    
    const progressToken = 'stream-456';
    
    // Start streaming
    await harness.streamResponse(chunks, progressToken);
    
    // Verify progress notifications were sent
    const progressNotification = await harness.expectNotification(
      'notifications/progress'
    );
    
    expect(progressNotification.params.progressToken).toBe(progressToken);
    expect(progressNotification.params.progress).toBe(100);
  });
});
```

### Soak Tests with Persistent State (NEW)

Soak tests implement the **Tier 2: System Lifecycle Tests** pattern from SYSTEMDESIGN.md, testing "one long-running system" rather than isolated mini-applications.

```typescript
import { TestHarness, MCPMonTestHarness } from '../../../testing/index.js';

describe('Large Response Handler Soak Tests', () => {
  let harness: TestHarness;
  let extension: LargeResponseHandlerExtension;
  
  // Persistent lifecycle - single system instance
  beforeAll(async () => {
    extension = new LargeResponseHandlerExtension();
    harness = new MCPMonTestHarness();
    
    // Initialize ONCE for entire test run
    await harness.initialize([extension]);
    await harness.enableExtension('large-response-handler');
  });
  
  afterAll(async () => {
    await harness.cleanup();
  });
  
  it('should handle complete large response workflow', async () => {
    await harness.withExtension('large-response-handler', async () => {
      const mockServer = harness.getMockServer();
      const progressToken = 'progress-token-123';
      
      // Configure streaming response
      mockServer.onToolCall('test-large-tool', async (args, context) => {
        const chunks = createTestChunks(5, 20); // 5 chunks, 20 items each
        await mockServer.streamResponse(chunks, context.progressToken, {
          chunkDelay: 10,
          sendProgress: true,
          progressInterval: 50
        });
        return null;
      });
      
      // Execute tool call - system accumulates state across calls
      const result = await harness.callTool(
        'test-large-tool',
        { data: 'request' },
        progressToken
      );
      
      // Verify real progress notifications (not mocked)
      const notification = await harness.expectNotification(
        'notifications/progress',
        1000
      );
      
      expect(notification.params.progressToken).toBeDefined();
      expect(notification.params.progress).toBeGreaterThan(0);
      expect(result.data).toBeDefined();
    });
  });
  
  it('should maintain performance across multiple operations', async () => {
    // Test system endurance - previous test state persists
    for (let i = 0; i < 10; i++) {
      const result = await harness.callTool('test-tool', { iteration: i });
      expect(result).toBeDefined();
      
      // System should maintain stable performance
      if (i % 5 === 0) {
        // Check system health every 5 iterations
        const proxy = harness.getProxy();
        expect(proxy.isRunning()).toBe(true);
      }
    }
  });
});
```

**Key Characteristics of Soak Tests:**
- **beforeAll/afterAll**: Single system initialization
- **Persistent State**: Extensions maintain state across tests
- **Real Components**: Uses actual MCPProxy and TestHarness
- **Production-Like**: Tests system behavior over extended operations
- **Performance Validation**: Monitors system health during extended usage

**When to Use Soak Tests:**
- Streaming response handling
- Progress notification flows
- Memory leak detection (future enhancement)
- Performance validation under load
- Complex multi-step integration scenarios

### E2E Tests with Client Simulation

End-to-end tests verify complete workflows with simulated MCP clients.

```typescript
import { E2ETestContext } from '../../../testing/index.js';

describe('E2E Extension Tests', () => {
  let e2eContext: E2ETestContext;
  
  beforeEach(async () => {
    e2eContext = new E2ETestContext();
  });
  
  it('should handle Claude Desktop client workflow', async () => {
    const client = e2eContext.simulateClient('claude-desktop');
    
    try {
      // Connect and initialize
      await client.connect();
      await client.initialize({
        capabilities: {
          tools: true,
          sampling: false
        }
      });
      
      // List available tools
      const tools = await client.listTools();
      expect(tools).toContainEqual(
        expect.objectContaining({ name: 'my-extension-tool' })
      );
      
      // Call tool with progress
      const result = await client.callTool('my-extension-tool', {
        input: 'test data'
      }, 'progress-token-123');
      
      expect(result.status).toBe('success');
      
      // Verify notifications were received
      const notifications = client.getNotifications();
      expect(notifications.some(n => n.method === 'notifications/progress')).toBe(true);
      
    } finally {
      await client.disconnect();
    }
  });
  
  it('should run complex scenario', async () => {
    const scenario: E2EScenario = {
      name: 'Multi-tool workflow',
      steps: [
        { action: 'connect' },
        { action: 'initialize', params: { capabilities: { tools: true } } },
        { action: 'callTool', params: { name: 'setup-tool', args: {} } },
        { action: 'wait', delay: 100 },
        { action: 'callTool', params: { name: 'process-tool', args: { data: 'test' } } },
        { action: 'callTool', params: { name: 'cleanup-tool', args: {} } },
        { action: 'disconnect' }
      ],
      assertions: [
        { type: 'notification', expected: { method: 'notifications/progress' } },
        { type: 'response', expected: { status: 'success' } }
      ]
    };
    
    const result = await e2eContext.runScenario(scenario);
    
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.capturedMessages.length).toBeGreaterThan(0);
  });
  
  it('should handle custom client configuration', async () => {
    const customClient = e2eContext.createCustomClient({
      name: 'custom-test-client',
      version: '1.0.0',
      capabilities: {
        tools: true,
        sampling: true,
        experimental: true
      },
      responseTimeout: 10000
    });
    
    await customClient.connect();
    await customClient.initialize();
    
    // Test with custom capabilities
    const tools = await customClient.listTools();
    expect(tools.length).toBeGreaterThan(0);
    
    await customClient.disconnect();
  });
});
```

### Testing Different Extension Types

#### Message Interceptors

```typescript
@TestContainer.register('message-interceptor')
export class MessageInterceptorTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'message-interceptor';
  
  async testRequestModification(): Promise<void> {
    const context = this.mockMCPMon.createContext({
      config: { redactFields: ['password', 'secret'] }
    });
    
    await this.extension.initialize(context);
    
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'auth-tool',
        arguments: { password: 'secret123', data: 'public' }
      }
    };
    
    const modifiedRequest = await context.testHelpers.triggerHook(
      'beforeStdinForward',
      request
    );
    
    expect(modifiedRequest.params.arguments.password).toBe('[REDACTED]');
    expect(modifiedRequest.params.arguments.data).toBe('public');
  }
  
  async testResponseFiltering(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {
        data: 'public info',
        internal: 'sensitive data'
      }
    };
    
    const filteredResponse = await context.testHelpers.triggerHook(
      'afterStdoutReceive',
      response
    );
    
    expect(filteredResponse.result.data).toBe('public info');
    expect(filteredResponse.result.internal).toBeUndefined();
  }
}
```

#### Tool Providers

```typescript
@TestContainer.register('tool-provider')
export class ToolProviderTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'tool-provider';
  
  async testToolRegistration(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    this.mockMCPMon.expectHookRegistered('getAdditionalTools');
    
    const tools = await context.testHelpers.triggerHook('getAdditionalTools');
    
    expect(tools).toContainEqual(
      expect.objectContaining({
        name: 'my-tool',
        description: expect.any(String),
        inputSchema: expect.any(Object)
      })
    );
  }
  
  async testToolExecution(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    const result = await context.testHelpers.triggerHook(
      'handleToolCall',
      'my-tool',
      { input: 'test data' }
    );
    
    expect(result).toMatchObject({
      status: 'success',
      output: expect.any(String)
    });
  }
  
  async testToolError(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    const result = await context.testHelpers.triggerHook(
      'handleToolCall',
      'my-tool',
      { invalid: 'input' }
    );
    
    expect(result).toMatchObject({
      status: 'error',
      error: expect.any(String)
    });
  }
}
```

#### Streaming Handlers

```typescript
@TestContainer.register('streaming-handler')
export class StreamingHandlerTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'streaming-handler';
  
  async testStreamingResponse(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate large response that should be streamed
    const largeResponse = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {
        data: Array(1000).fill({ id: 1, content: 'large data' })
      }
    };
    
    const processedResponse = await context.testHelpers.triggerHook(
      'afterStdoutReceive',
      largeResponse
    );
    
    // Should be converted to streaming metadata
    expect(processedResponse.result.streaming).toBe(true);
    expect(processedResponse.result.chunks).toBeDefined();
    expect(processedResponse.result.totalSize).toBeGreaterThan(0);
  }
  
  async testProgressNotifications(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate streaming with progress
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    
    for (let i = 0; i < chunks.length; i++) {
      const progressNotification = {
        jsonrpc: '2.0' as const,
        method: 'notifications/progress',
        params: {
          progressToken: 'stream-123',
          progress: Math.round(((i + 1) / chunks.length) * 100),
          total: 100,
          message: `Processing chunk ${i + 1}/${chunks.length}`
        }
      };
      
      await this.mockMCPMon.simulateNotification(progressNotification);
    }
    
    const notifications = this.mockMCPMon.getProgressNotifications();
    expect(notifications).toHaveLength(chunks.length);
    expect(notifications[notifications.length - 1].params.progress).toBe(100);
  }
}
```

#### Progress Notifications

```typescript
@TestContainer.register('progress-handler')
export class ProgressHandlerTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'progress-handler';
  
  async testProgressTracking(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    // Simulate long-running operation
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'long-tool',
        arguments: { size: 'large' },
        _meta: { progressToken: 'progress-456' }
      }
    };
    
    // Should register progress tracking
    await context.testHelpers.triggerHook('beforeStdinForward', request);
    
    // Simulate progress updates
    const progressUpdates = [25, 50, 75, 100];
    
    for (const progress of progressUpdates) {
      const notification = {
        jsonrpc: '2.0' as const,
        method: 'notifications/progress',
        params: {
          progressToken: 'progress-456',
          progress,
          total: 100,
          message: `${progress}% complete`
        }
      };
      
      await this.mockMCPMon.simulateNotification(notification);
    }
    
    const notifications = this.mockMCPMon.getProgressNotifications();
    expect(notifications).toHaveLength(4);
    expect(notifications.map(n => n.params.progress)).toEqual([25, 50, 75, 100]);
  }
  
  async testProgressTimeout(): Promise<void> {
    const context = this.mockMCPMon.createContext({
      config: { progressTimeout: 1000 }
    });
    
    await this.extension.initialize(context);
    
    // Start operation with progress
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'timeout-tool',
        arguments: {},
        _meta: { progressToken: 'timeout-789' }
      }
    };
    
    await context.testHelpers.triggerHook('beforeStdinForward', request);
    
    // Wait for timeout (mock timer)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should have logged timeout warning
    const logs = context.logger.getLogs();
    expect(logs.some(log => 
      log.level === 'warn' && 
      log.message.includes('timeout')
    )).toBe(true);
  }
}
```

## Best Practices

### Test Organization

1. **One test suite per extension**: Use the `@TestContainer.register` decorator
2. **Group related tests**: Use descriptive method names
3. **Clean setup/teardown**: Always implement proper cleanup
4. **Isolation**: Each test should be independent

```typescript
@TestContainer.register('my-extension')
export class MyExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'my-extension';
  
  // Group tests by functionality
  async testBasicInitialization(): Promise<void> { /* ... */ }
  async testAdvancedInitialization(): Promise<void> { /* ... */ }
  
  async testMessageInterception(): Promise<void> { /* ... */ }
  async testMessageFiltering(): Promise<void> { /* ... */ }
  
  async testToolRegistration(): Promise<void> { /* ... */ }
  async testToolExecution(): Promise<void> { /* ... */ }
  async testToolErrors(): Promise<void> { /* ... */ }
}
```

### Mock Configuration

Use realistic configuration in tests:

```typescript
async setupTests(): Promise<void> {
  this.mockMCPMon = createMockMCPMon();
  
  // Use configuration similar to production
  this.testConfig = {
    enabled: true,
    threshold: 1000,
    retryAttempts: 3,
    timeout: 5000,
    features: {
      caching: true,
      compression: false
    }
  };
}

async testWithProductionConfig(): Promise<void> {
  const context = this.mockMCPMon.createContext({
    config: this.testConfig
  });
  
  await this.extension.initialize(context);
  // Test with realistic configuration
}
```

### Error Testing

Always test error conditions:

```typescript
async testNetworkError(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  // Mock network failure
  context.dependencies.changeSource.readFile = async () => {
    throw new Error('Network timeout');
  };
  
  const request = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: { name: 'network-tool', arguments: {} }
  };
  
  const response = await this.mockMCPMon.simulateRequest(request);
  
  expect(response.error).toBeDefined();
  expect(response.error.message).toContain('Network timeout');
}

async testInvalidInput(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const result = await context.testHelpers.triggerHook(
    'handleToolCall',
    'validation-tool',
    { invalid: 'missing required fields' }
  );
  
  expect(result.status).toBe('error');
  expect(result.error).toContain('validation failed');
}
```

### Performance Testing

Test performance characteristics:

```typescript
async testPerformance(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const startTime = Date.now();
  
  // Process large request
  const largeRequest = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: {
      name: 'large-tool',
      arguments: { data: 'x'.repeat(100000) }
    }
  };
  
  await this.mockMCPMon.simulateRequest(largeRequest);
  
  const duration = Date.now() - startTime;
  
  // Should complete within reasonable time
  expect(duration).toBeLessThan(1000);
}

async testMemoryUsage(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Process many requests
  for (let i = 0; i < 100; i++) {
    const request = {
      jsonrpc: '2.0' as const,
      id: i,
      method: 'tools/call',
      params: { name: 'memory-tool', arguments: { data: `test${i}` } }
    };
    
    await this.mockMCPMon.simulateRequest(request);
  }
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  // Should not leak significant memory
  expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
}
```

### Async Testing

Handle asynchronous operations properly:

```typescript
async testAsyncHooks(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const promises: Promise<any>[] = [];
  
  // Trigger multiple async operations
  for (let i = 0; i < 10; i++) {
    const request = {
      jsonrpc: '2.0' as const,
      id: i,
      method: 'tools/call',
      params: { name: 'async-tool', arguments: { id: i } }
    };
    
    promises.push(this.mockMCPMon.simulateRequest(request));
  }
  
  // Wait for all to complete
  const responses = await Promise.all(promises);
  
  responses.forEach((response, index) => {
    expect(response.result.id).toBe(index);
  });
}

async testConcurrentAccess(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  // Test concurrent hook calls
  const hookPromises = [];
  
  for (let i = 0; i < 5; i++) {
    hookPromises.push(
      context.testHelpers.triggerHook('beforeStdinForward', {
        jsonrpc: '2.0' as const,
        id: i,
        method: 'test',
        params: { concurrent: true }
      })
    );
  }
  
  const results = await Promise.all(hookPromises);
  expect(results).toHaveLength(5);
}
```

## Configuration

### Test Suite Configuration

Configure test suites using the decorator options:

```typescript
@TestContainer.register('my-extension', {
  tags: ['integration', 'slow'],
  timeout: 10000,
  skipIf: () => process.env.SKIP_SLOW_TESTS === 'true',
  parallel: false
})
export class MyExtensionTestSuite implements ExtensionTestSuite {
  // Test implementation
}
```

### Mock Configuration

Customize mock behavior:

```typescript
async setupTests(): Promise<void> {
  this.mockMCPMon = createMockMCPMon({
    captureAllMessages: true,
    enableProgressTracking: true,
    mockNetworkDelay: 100,
    strictValidation: true
  });
}
```

### Integration Test Configuration

Configure test harness for integration tests:

```typescript
beforeEach(async () => {
  harness = new MCPMonTestHarness({
    timeout: 30000,
    enableLogging: true,
    mockFileSystem: {
      dataDir: '/tmp/test-mcpmon',
      autoCleanup: true
    },
    processManager: {
      killDelay: 100,
      restartDelay: 50
    }
  });
});
```

### E2E Test Configuration

Configure end-to-end test environment:

```typescript
beforeEach(async () => {
  e2eContext = new E2ETestContext({
    baseUrl: 'http://localhost:8080',
    timeout: 60000,
    retries: 3,
    clientDefaults: {
      responseTimeout: 10000,
      initializationDelay: 1000
    }
  });
});
```

### Environment Configuration

Use environment variables for test configuration:

```typescript
const testConfig = {
  enabled: process.env.TEST_ENABLED !== 'false',
  dataDir: process.env.TEST_DATA_DIR || '/tmp/mcpmon-test',
  logLevel: process.env.TEST_LOG_LEVEL || 'info',
  timeout: parseInt(process.env.TEST_TIMEOUT || '5000'),
  retries: parseInt(process.env.TEST_RETRIES || '0')
};
```

## Troubleshooting

### Common Issues

#### Test Suite Not Found

```
Error: Test suite not found for extension 'my-extension'
```

**Solution**: Ensure the test suite is properly registered and the file is imported:

```typescript
// Make sure the decorator is applied
@TestContainer.register('my-extension')
export class MyExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'my-extension'; // Must match registration
}

// Ensure the test file is in the correct location
// src/extensions/my-extension/tests/index.ts
```

#### Hook Not Registered

```
Error: Expected hook 'beforeStdinForward' to be registered, but it was not found
```

**Solution**: Verify hook registration in extension initialization:

```typescript
async initialize(context: ExtensionContext): Promise<void> {
  // Make sure hooks are assigned to context.hooks
  context.hooks.beforeStdinForward = this.handleRequest.bind(this);
  context.hooks.afterStdoutReceive = this.handleResponse.bind(this);
}
```

#### Mock Dependencies Not Working

```
Error: Process spawning not supported in mock context
```

**Solution**: Provide custom mock implementations:

```typescript
const context = mockMCPMon.createContext({
  dependencies: {
    procManager: {
      spawn: () => mockProcess
    },
    changeSource: {
      readFile: async (path) => mockFileContent,
      writeFile: async (path, content) => { /* mock implementation */ }
    }
  }
});
```

#### Timeout Issues

```
Error: Timeout waiting for notification: notifications/progress
```

**Solution**: Increase timeout or check notification method:

```typescript
// Increase timeout
await harness.expectNotification('notifications/progress', 10000);

// Or check exact method name
const notifications = mockMCPMon.getProgressNotifications();
console.log('Available notifications:', notifications.map(n => n.method));
```

### Debugging Tips

#### Enable Debug Logging

```typescript
const context = mockMCPMon.createContext({
  logger: {
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
    info: (msg) => console.info(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
  }
});
```

#### Inspect Captured Messages

```typescript
async testMessageFlow(): Promise<void> {
  // ... test setup
  
  await mockMCPMon.simulateRequest(request);
  
  // Debug captured messages
  const messages = mockMCPMon.getCapturedMessages();
  console.log('Captured messages:', JSON.stringify(messages, null, 2));
  
  expect(messages).toHaveLength(2); // request + response
}
```

#### Check Hook Calls

```typescript
async testHookExecution(): Promise<void> {
  const context = mockMCPMon.createContext();
  await extension.initialize(context);
  
  await context.testHelpers.triggerHook('beforeStdinForward', request);
  
  // Debug hook calls
  const calls = context.testHelpers.getHookCalls('beforeStdinForward');
  console.log('Hook calls:', calls);
  
  expect(calls).toHaveLength(1);
}
```

### Performance Debugging

#### Measure Test Execution Time

```typescript
async testPerformance(): Promise<void> {
  console.time('test-execution');
  
  // Test code here
  
  console.timeEnd('test-execution');
}
```

#### Memory Leak Detection

```typescript
async testMemoryLeaks(): Promise<void> {
  const getMemoryUsage = () => process.memoryUsage().heapUsed;
  
  const beforeMemory = getMemoryUsage();
  
  // Create many instances
  for (let i = 0; i < 1000; i++) {
    const context = mockMCPMon.createContext();
    await extension.initialize(context);
    await extension.shutdown();
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const afterMemory = getMemoryUsage();
  const leakage = afterMemory - beforeMemory;
  
  console.log(`Memory usage: ${beforeMemory} -> ${afterMemory} (${leakage} bytes)`);
  
  expect(leakage).toBeLessThan(1024 * 1024); // 1MB threshold
}
```

## Contributing

### Adding New Test Utilities

When adding new test utilities to the framework:

1. **Define interfaces** in `types.ts`:

```typescript
export interface NewTestUtility {
  setup(): Promise<void>;
  execute(params: any): Promise<any>;
  cleanup(): Promise<void>;
}
```

2. **Implement the utility**:

```typescript
export class NewTestUtilityImpl implements NewTestUtility {
  async setup(): Promise<void> {
    // Implementation
  }
  
  async execute(params: any): Promise<any> {
    // Implementation
  }
  
  async cleanup(): Promise<void> {
    // Implementation
  }
}
```

3. **Register with DI container**:

```typescript
// In TestContainer.bindTestUtilities()
container.bind(TEST_TYPES.NewTestUtility).to(NewTestUtilityImpl);
```

4. **Export from index**:

```typescript
export { NewTestUtilityImpl as NewTestUtility } from './new-test-utility.js';
export type { NewTestUtility } from './types.js';
```

### Test Framework Guidelines

1. **Keep tests fast**: Unit tests should complete in milliseconds
2. **Make tests deterministic**: Avoid random data or timing dependencies
3. **Use meaningful assertions**: Verify specific behavior, not just absence of errors
4. **Document complex test scenarios**: Add comments explaining test logic
5. **Follow naming conventions**: Use descriptive test method names

### Code Style

Follow these conventions when contributing:

```typescript
// Test method naming
async testFeatureUnderSpecificConditions(): Promise<void> {
  // Given
  const context = this.mockMCPMon.createContext({ /* setup */ });
  
  // When
  const result = await this.extension.doSomething(context);
  
  // Then
  expect(result).toMatchObject({ expected: 'behavior' });
}

// Use descriptive variable names
const invalidRequestWithMissingParams = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'tools/call'
  // Missing params
};

// Group related assertions
expect(response).toMatchObject({
  jsonrpc: '2.0',
  id: 1
});
expect(response.result).toBeDefined();
expect(response.error).toBeUndefined();
```

## Migration Guide

### From Old Test Patterns

If you have existing tests using manual mocking, here's how to migrate:

#### Before (Manual Mocking)

```typescript
describe('MyExtension', () => {
  let extension: MyExtension;
  let mockContext: any;
  
  beforeEach(() => {
    mockContext = {
      hooks: {},
      logger: { info: jest.fn(), debug: jest.fn() },
      config: {}
    };
    extension = new MyExtension();
  });
  
  it('should register hooks', async () => {
    await extension.initialize(mockContext);
    expect(mockContext.hooks.beforeStdinForward).toBeDefined();
  });
});
```

#### After (Test Framework)

```typescript
@TestContainer.register('my-extension')
export class MyExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'my-extension';
  
  private extension: MyExtension;
  private mockMCPMon: MockMCPMon;
  
  async setupTests(): Promise<void> {
    this.extension = new MyExtension();
    this.mockMCPMon = createMockMCPMon();
  }
  
  async teardownTests(): Promise<void> {
    await this.extension.shutdown();
    this.mockMCPMon.reset();
  }
  
  async testHookRegistration(): Promise<void> {
    const context = this.mockMCPMon.createContext();
    await this.extension.initialize(context);
    
    this.mockMCPMon.expectHookRegistered('beforeStdinForward');
  }
}
```

### Breaking Changes

#### Version 1.0 to 2.0

1. **Test registration** now requires `@TestContainer.register` decorator
2. **Mock creation** uses `createMockMCPMon()` instead of manual setup
3. **Hook testing** uses `testHelpers.triggerHook()` instead of direct calls
4. **Verification** uses framework methods like `expectHookRegistered()`

#### Migration Steps

1. **Wrap existing tests** in test suite classes:

```typescript
// Old
describe('Extension Tests', () => { /* tests */ });

// New
@TestContainer.register('extension-id')
export class ExtensionTestSuite implements ExtensionTestSuite {
  readonly extensionId = 'extension-id';
  // Convert describe blocks to class methods
}
```

2. **Replace manual mocks** with framework utilities:

```typescript
// Old
const mockContext = { hooks: {}, logger: mockLogger };

// New
const context = this.mockMCPMon.createContext({ config: testConfig });
```

3. **Update assertions** to use framework methods:

```typescript
// Old
expect(mockContext.hooks.beforeStdinForward).toBeDefined();

// New
this.mockMCPMon.expectHookRegistered('beforeStdinForward');
```

## Performance Testing Considerations

### Test Execution Performance

Monitor test execution time and optimize slow tests:

```typescript
async testExecutionTime(): Promise<void> {
  const startTime = process.hrtime.bigint();
  
  // Test code here
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1_000_000;
  
  // Log slow tests
  if (durationMs > 100) {
    console.warn(`Slow test detected: ${durationMs}ms`);
  }
  
  expect(durationMs).toBeLessThan(1000); // 1 second max
}
```

### Resource Usage Testing

Test extension resource consumption:

```typescript
async testResourceUsage(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const before = process.resourceUsage();
  
  // Run intensive operation
  for (let i = 0; i < 10000; i++) {
    await this.mockMCPMon.simulateRequest({
      jsonrpc: '2.0',
      id: i,
      method: 'tools/call',
      params: { name: 'cpu-intensive-tool', arguments: {} }
    });
  }
  
  const after = process.resourceUsage();
  
  // Check CPU usage
  const cpuTime = (after.userCPUTime - before.userCPUTime) / 1000; // Convert to ms
  expect(cpuTime).toBeLessThan(5000); // 5 seconds max CPU time
  
  // Check system calls
  const syscalls = after.involuntaryContextSwitches - before.involuntaryContextSwitches;
  expect(syscalls).toBeLessThan(1000);
}
```

### Load Testing

Test extension behavior under load:

```typescript
async testHighLoad(): Promise<void> {
  const context = this.mockMCPMon.createContext();
  await this.extension.initialize(context);
  
  const concurrency = 50;
  const requestsPerClient = 100;
  
  const promises: Promise<any>[] = [];
  
  for (let client = 0; client < concurrency; client++) {
    promises.push(this.runClientLoad(client, requestsPerClient));
  }
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  // Verify all requests succeeded
  const totalRequests = concurrency * requestsPerClient;
  const successfulRequests = results.flat().filter(r => r.success).length;
  
  expect(successfulRequests).toBe(totalRequests);
  expect(duration).toBeLessThan(30000); // 30 seconds max
  
  // Check average response time
  const avgResponseTime = duration / totalRequests;
  expect(avgResponseTime).toBeLessThan(100); // 100ms average
}

private async runClientLoad(clientId: number, requests: number): Promise<any[]> {
  const results = [];
  
  for (let i = 0; i < requests; i++) {
    try {
      const response = await this.mockMCPMon.simulateRequest({
        jsonrpc: '2.0',
        id: `${clientId}-${i}`,
        method: 'tools/call',
        params: { name: 'load-test-tool', arguments: { clientId, requestId: i } }
      });
      
      results.push({ success: true, response });
    } catch (error) {
      results.push({ success: false, error });
    }
  }
  
  return results;
}
```

---

This comprehensive documentation provides everything needed to effectively use the MCPMon DI test framework for extension development. The framework supports all testing levels from fast unit tests to comprehensive end-to-end scenarios, with powerful dependency injection and mocking capabilities.