# Testing Documentation

This document provides comprehensive information about the mcpmon test suite, including architecture, patterns, and best practices.

## Table of Contents

- [Test Architecture](#test-architecture)
- [Test Categories](#test-categories)
- [Test Helper Pattern](#test-helper-pattern)
- [Writing Tests](#writing-tests)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [MCP Protocol Testing](#mcp-protocol-testing)

## Test Architecture

The test suite uses **dependency injection with mock implementations** to provide reliable, fast behavioral testing alongside integration tests using Jest and real MCP client/server communication.

### Key Principles

1. **Platform Agnostic**: Tests use interfaces, not concrete implementations
2. **Deterministic Timing**: Event-driven waiting instead of fixed timeouts
3. **Resource Safety**: Proper cleanup in all test paths
4. **DRY Compliance**: Shared helpers eliminate code duplication

### Test Structure

```
tests/
├── behavior/          # Platform-agnostic behavioral tests
│   ├── test_helper.ts # Shared test utilities
│   └── *.test.ts      # Behavioral test files
├── integration/       # Integration tests
├── mocks/             # Mock implementations
│   ├── MockProcessManager.ts
│   └── MockFileSystem.ts
└── fixtures/          # Test MCP servers
```

## Test Categories

### Behavioral Tests (`tests/behavior/`)

Platform-agnostic tests that verify proxy behavior through interfaces:

- **proxy_restart.test.ts** - Server restart on file changes
- **message_buffering.test.ts** - Message queuing during restart
- **initialization_replay.test.ts** - MCP handshake preservation
- **error_handling.test.ts** - Fault tolerance and recovery
- **error_scenarios.test.ts** - Additional error path coverage
- **generic_interfaces.test.ts** - Interface extensibility tests

**Characteristics:**

- Fast execution with deterministic timing using `test_helper.ts`
- Tests proxy logic without external dependencies
- Comprehensive coverage of edge cases and error conditions
- Reduced boilerplate code compared to traditional test patterns

### Integration Tests (`tests/integration/`)

Integration tests with real implementations:

- **cli.test.ts** - Command-line interface testing
- **node_implementations.test.ts** - NodeFileSystem and NodeProcessManager tests

**Characteristics:**

- Tests real Node.js implementations
- Validates actual file I/O and process spawning
- Tests CLI argument parsing and behavior

## Testing Framework

mcpmon uses a comprehensive dependency injection-based testing framework centered around `TestContainer` for consistent, reliable testing across all components. This framework supports multiple testing modes including unit tests with mocks, integration tests with real components, and soak tests for long-running scenarios.

### TestContainer Dependency Injection Setup

The `TestContainer` class provides centralized dependency injection for all test scenarios:

```typescript
import { TestContainer } from '../src/testing/TestContainer';

// Create test container with default mocks
const container = new TestContainer();

// Register custom implementations
container.register('mcpmon', customMockMCPMon);
container.register('file-system', customFileSystem);

// Get dependencies
const mcpmon = container.get<MCPMon>('mcpmon');
const fileSystem = container.get<FileSystem>('file-system');
```

#### Container Configuration

The TestContainer supports multiple configuration modes:

```typescript
// Mock mode (default) - fast unit tests
const container = new TestContainer({ mode: 'mock' });

// Integration mode - real components
const container = new TestContainer({ mode: 'integration' });

// Soak mode - persistent system testing
const container = new TestContainer({ mode: 'soak' });
```

#### Dependency Registration

Register custom implementations for specific test scenarios:

```typescript
// Custom mock with specific behavior
container.register('change-source', new MockChangeSource({
  watchTargets: ['/test/file.js'],
  triggerDelay: 100
}));

// Real implementation for integration tests
container.register('process-manager', new NodeProcessManager());
```

### MockMCPMon Usage Patterns

The `MockMCPMon` class provides comprehensive mocking capabilities for testing extensions and proxy behavior:

#### Basic Usage

```typescript
import { MockMCPMon } from '../src/testing/MockMCPMon';

const mockMCPMon = new MockMCPMon();

// Configure behavior
mockMCPMon.setResponseDelay(100);
mockMCPMon.setMessageBufferSize(1000);

// Simulate events
mockMCPMon.simulateRestart();
mockMCPMon.simulateFileChange('/test/server.js');
```

#### Extension Testing

```typescript
// Register extension with mock
const extension = new LargeResponseHandlerExtension();
mockMCPMon.registerExtension(extension);

// Test extension behavior
const result = await mockMCPMon.processMessage({
  method: 'tools/call',
  params: { name: 'test_tool' }
});

// Verify extension interactions
expect(mockMCPMon.getExtensionCallCount()).toBe(1);
expect(mockMCPMon.getLastExtensionCall()).toMatchObject({
  method: 'handleMessage',
  args: [expect.objectContaining({ method: 'tools/call' })]
});
```

#### Message Flow Testing

```typescript
// Test message buffering during restart
mockMCPMon.startMessageBuffering();
await mockMCPMon.sendMessage({ method: 'tools/list' });
await mockMCPMon.simulateRestart();

// Verify buffered messages are replayed
const replayedMessages = mockMCPMon.getReplayedMessages();
expect(replayedMessages).toHaveLength(1);
expect(replayedMessages[0]).toMatchObject({ method: 'tools/list' });
```

### TestHarness Integration Testing

The `TestHarness` class provides integration testing capabilities with real components:

#### Setup and Configuration

```typescript
import { TestHarness } from '../src/testing/TestHarness';
import { TestConfig } from '../src/testing/types';

const config: TestConfig = {
  mode: 'integration',
  timeout: 5000,
  cleanup: true,
  extensions: ['large-response-handler']
};

const harness = new TestHarness(config);
```

#### Component Integration

```typescript
// Start harness with real proxy
await harness.start({
  command: 'node',
  args: ['test-server.js'],
  watchTargets: ['test-server.js']
});

// Test real MCP communication
const response = await harness.sendMessage({
  method: 'tools/call',
  params: { name: 'test_tool' }
});

// Verify real extension behavior
expect(response.content).toBeDefined();
expect(harness.getExtensionMetrics('large-response-handler')).toMatchObject({
  messagesProcessed: 1,
  averageResponseTime: expect.any(Number)
});
```

#### Soak Testing

```typescript
// Long-running system testing
const harness = new TestHarness({ mode: 'soak' });

beforeAll(async () => {
  await harness.start();
});

afterAll(async () => {
  await harness.cleanup();
});

test('Extension handles high message volume', async () => {
  // Send 1000 messages over 10 minutes
  for (let i = 0; i < 1000; i++) {
    await harness.sendMessage({ method: 'tools/list' });
    await harness.waitForStable(600); // 10 minutes total
  }
  
  // Verify system stability
  const metrics = harness.getSystemMetrics();
  expect(metrics.memoryUsage).toBeLessThan(100 * 1024 * 1024); // < 100MB
  expect(metrics.errorCount).toBe(0);
});
```

## Examples

This section provides comprehensive examples demonstrating all testing patterns available in the mcpmon testing framework. Each example showcases dependency injection, mock implementations, and extension testing capabilities.

### TestContainer Dependency Injection Examples

The TestContainer provides centralized dependency management for all test scenarios. Here are comprehensive examples showing different usage patterns:

#### Basic TestContainer Setup

```typescript
import { TestContainer } from '../src/testing/TestContainer';
import { MockMCPMon } from '../src/testing/MockMCPMon';
import { MockChangeSource } from '../src/testing/mocks/MockChangeSource';

describe('DI Examples - Basic Setup', () => {
  let container: TestContainer;
  
  beforeEach(() => {
    // Create container with mock mode (fast unit tests)
    container = new TestContainer({ mode: 'mock' });
  });
  
  afterEach(async () => {
    await container.cleanup();
  });

  it('demonstrates basic dependency injection', async () => {
    // Get dependencies from container
    const mcpmon = container.get<MockMCPMon>('mcpmon');
    const changeSource = container.get<MockChangeSource>('change-source');
    const processManager = container.get('process-manager');
    
    // Configure mock behavior
    mcpmon.setResponseDelay(50);
    changeSource.setWatchTargets(['/test/server.js']);
    
    // Test with injected dependencies
    await mcpmon.start();
    changeSource.simulateChange({
      type: 'file',
      operation: 'modify',
      path: '/test/server.js'
    });
    
    await mcpmon.waitForRestart();
    expect(mcpmon.getRestartCount()).toBe(1);
  });
});
```

#### Advanced Dependency Registration

```typescript
describe('DI Examples - Custom Registration', () => {
  it('registers custom mock implementations', async () => {
    const container = new TestContainer({ mode: 'mock' });
    
    try {
      // Register custom change source with specific behavior
      const customChangeSource = new MockChangeSource({
        watchTargets: ['/test/config.json', '/test/server.js'],
        debounceDelay: 200,
        simulateErrors: false
      });
      container.register('change-source', customChangeSource);
      
      // Register custom process manager with failure simulation
      const customProcessManager = new MockProcessManager({
        spawnDelay: 100,
        killDelay: 50,
        failureRate: 0.1 // 10% failure rate
      });
      container.register('process-manager', customProcessManager);
      
      // Get registered dependencies
      const mcpmon = container.get<MockMCPMon>('mcpmon');
      const changeSource = container.get<MockChangeSource>('change-source');
      
      // Test with custom implementations
      await mcpmon.start();
      
      // Trigger multiple file changes
      changeSource.simulateChange({
        type: 'file',
        operation: 'modify',
        path: '/test/config.json'
      });
      
      changeSource.simulateChange({
        type: 'file',
        operation: 'modify',
        path: '/test/server.js'
      });
      
      // Verify debounced behavior
      await mcpmon.waitForStable(300);
      expect(mcpmon.getRestartCount()).toBe(1); // Debounced to single restart
    } finally {
      await container.cleanup();
    }
  });
});
```

## Troubleshooting

This section covers common issues encountered when working with the mcpmon dependency injection (DI) framework and their solutions.

### Common DI Testing Issues

The dependency injection framework can present several challenges during testing. Understanding these issues helps maintain reliable test suites.

#### Container Lifecycle Management

**Issue**: TestContainer instances not properly cleaned up between tests causing resource leaks and test interference.

```typescript
// WRONG - Container persists between tests
describe('DI Tests - Resource Leaks', () => {
  const container = new TestContainer({ mode: 'mock' }); // ❌ Shared instance
  
  it('first test', async () => {
    const mcpmon = container.get<MockMCPMon>('mcpmon');
    // Test logic without cleanup
  });
  
  it('second test', async () => {
    const mcpmon = container.get<MockMCPMon>('mcpmon'); // ❌ Reused state
    // This test may fail due to previous test state
  });
});
```

**Solution**: Always create fresh container instances per test and ensure proper cleanup:

```typescript
// CORRECT - Proper lifecycle management
describe('DI Tests - Clean Lifecycle', () => {
  let container: TestContainer;
  
  beforeEach(() => {
    container = new TestContainer({ mode: 'mock' }); // ✅ Fresh instance
  });
  
  afterEach(async () => {
    await container.cleanup(); // ✅ Explicit cleanup
  });
  
  it('each test has clean state', async () => {
    const mcpmon = container.get<MockMCPMon>('mcpmon');
    // Test runs with clean dependencies
  });
});
```

#### Dependency Registration Order

**Issue**: Dependencies registered in wrong order causing circular dependency errors or undefined behavior.

```typescript
// WRONG - Extension registered before dependencies
container.register('large-response-handler', new LargeResponseHandlerExtension()); // ❌
container.register('threshold-manager', new MockThresholdManager()); // Too late
```

**Solution**: Register dependencies before components that use them:

```typescript
// CORRECT - Dependencies first, then consumers
container.register('threshold-manager', new MockThresholdManager()); // ✅ Dependency first
container.register('response-handler', new MockResponseHandler());
container.register('large-response-handler', new LargeResponseHandlerExtension()); // ✅ Consumer last
```

### Mock Implementation Problems

Mock implementations can introduce subtle bugs if not configured correctly for the test scenario.

#### Mock State Persistence

**Issue**: Mock objects retain state between test operations, causing unexpected behavior in subsequent tests.

```typescript
// WRONG - Mock state persists
describe('Mock State Issues', () => {
  const mockMCPMon = new MockMCPMon(); // ❌ Shared mock
  
  it('first test increments counter', async () => {
    await mockMCPMon.processMessage({ method: 'tools/list' });
    expect(mockMCPMon.getCallCount()).toBe(1);
  });
  
  it('second test expects clean state', async () => {
    expect(mockMCPMon.getCallCount()).toBe(0); // ❌ FAILS - counter is 1
  });
});
```

**Solution**: Use fresh mock instances or explicit state reset:

```typescript
// CORRECT - Fresh mock instances
describe('Mock State Clean', () => {
  let mockMCPMon: MockMCPMon;
  
  beforeEach(() => {
    mockMCPMon = new MockMCPMon(); // ✅ Fresh instance
  });
  
  afterEach(async () => {
    await mockMCPMon.cleanup(); // ✅ Explicit cleanup
  });
  
  it('each test has clean mock state', async () => {
    expect(mockMCPMon.getCallCount()).toBe(0); // ✅ Always 0
  });
});
```

#### Mock Configuration Validation

**Issue**: Mock configurations that don't match expected interfaces, leading to runtime errors.

```typescript
// WRONG - Invalid mock configuration
const mockChangeSource = new MockChangeSource({
  watchTargets: 'not-an-array', // ❌ Wrong type
  debounceDelay: 'invalid' // ❌ Not a number
});
```

**Solution**: Use proper TypeScript types and validation:

```typescript
// CORRECT - Proper mock configuration
const mockChangeSource = new MockChangeSource({
  watchTargets: ['/test/server.js'], // ✅ Correct array type
  debounceDelay: 100, // ✅ Correct number type
  simulateErrors: false // ✅ Optional boolean
});

// Add runtime validation
if (!Array.isArray(mockChangeSource.getWatchTargets())) {
  throw new Error('MockChangeSource watchTargets must be an array');
}
```

### TestContainer Troubleshooting

TestContainer issues often stem from dependency resolution and configuration problems.

#### Dependency Resolution Failures

**Issue**: TestContainer cannot resolve dependencies due to missing registrations or circular dependencies.

```typescript
// WRONG - Missing dependency registration
const container = new TestContainer({ mode: 'mock' });
const mcpmon = container.get<MockMCPMon>('mcpmon'); // ❌ May fail if dependencies missing
```

**Error Output:**
```
Error: Cannot resolve dependency 'change-source' for 'mcpmon'
  at TestContainer.get (TestContainer.ts:84)
```

**Solution**: Verify all dependencies are registered and check for circular references:

```typescript
// CORRECT - Complete dependency registration
const container = new TestContainer({ mode: 'mock' });

// Register all required dependencies first
container.register('file-system', new MockFileSystem());
container.register('process-manager', new MockProcessManager());
container.register('change-source', new MockChangeSource({
  watchTargets: ['/test/server.js']
}));

// Now mcpmon can be resolved
const mcpmon = container.get<MockMCPMon>('mcpmon'); // ✅ All dependencies available
```

#### Configuration Mode Conflicts

**Issue**: TestContainer mode conflicts between different test requirements.

```typescript
// WRONG - Conflicting modes in same test suite
describe('Mixed Mode Issues', () => {
  it('unit test needs mocks', async () => {
    const container = new TestContainer({ mode: 'integration' }); // ❌ Wrong mode
    // Expects mocks but gets real implementations
  });
  
  it('integration test needs real components', async () => {
    const container = new TestContainer({ mode: 'mock' }); // ❌ Wrong mode
    // Expects real components but gets mocks
  });
});
```

**Solution**: Use appropriate modes for test requirements and separate test suites:

```typescript
// CORRECT - Separate test suites by mode
describe('Unit Tests - Mock Mode', () => {
  beforeEach(() => {
    container = new TestContainer({ mode: 'mock' }); // ✅ Consistent mode
  });
  
  // Unit tests with mocks
});

describe('Integration Tests - Integration Mode', () => {
  beforeEach(() => {
    container = new TestContainer({ mode: 'integration' }); // ✅ Consistent mode
  });
  
  // Integration tests with real components
});
```

### Extension Testing Gotchas

Extension testing presents unique challenges due to the interaction between extensions and the DI framework.

#### Extension Registration Timing

**Issue**: Extensions registered after mcpmon starts, causing extensions to not be loaded properly.

```typescript
// WRONG - Extension registered after start
const mockMCPMon = container.get<MockMCPMon>('mcpmon');
await mockMCPMon.start(); // ❌ Started without extensions
mockMCPMon.registerExtension(new LargeResponseHandlerExtension()); // Too late
```

**Solution**: Register extensions before starting mcpmon:

```typescript
// CORRECT - Extension registered before start
const mockMCPMon = container.get<MockMCPMon>('mcpmon');
mockMCPMon.registerExtension(new LargeResponseHandlerExtension()); // ✅ Before start
await mockMCPMon.start(); // Extensions loaded correctly
```

#### Extension Configuration Isolation

**Issue**: Extension configurations leak between tests, causing unexpected behavior.

```typescript
// WRONG - Extension configuration persists
describe('Extension Config Issues', () => {
  const extension = new LargeResponseHandlerExtension({ // ❌ Shared instance
    threshold: 25 * 1024
  });
  
  it('first test modifies config', async () => {
    extension.setThreshold(50 * 1024); // Modifies shared instance
  });
  
  it('second test expects default config', async () => {
    expect(extension.getThreshold()).toBe(25 * 1024); // ❌ FAILS - is 50KB
  });
});
```

**Solution**: Create fresh extension instances per test:

```typescript
// CORRECT - Fresh extension instances
describe('Extension Config Clean', () => {
  let extension: LargeResponseHandlerExtension;
  
  beforeEach(() => {
    extension = new LargeResponseHandlerExtension({ // ✅ Fresh instance
      threshold: 25 * 1024
    });
  });
  
  it('each test has clean extension config', async () => {
    expect(extension.getThreshold()).toBe(25 * 1024); // ✅ Always default
  });
});
```

#### Extension Dependency Injection

**Issue**: Extensions not receiving injected dependencies correctly, falling back to default implementations.

```typescript
// WRONG - Extension without DI
const extension = new LargeResponseHandlerExtension(); // ❌ No dependencies injected
// Uses default implementations instead of test mocks
```

**Solution**: Pass TestContainer to extension constructor for proper DI:

```typescript
// CORRECT - Extension with DI
const container = new TestContainer({ mode: 'mock' });
const extension = new LargeResponseHandlerExtension({
  dependencies: container, // ✅ Inject container for DI
  threshold: 25 * 1024
});

// Extension now uses injected mock dependencies
const responseHandler = extension.getResponseHandler(); // Returns mock from container
```

#### Extension Metrics Collection

**Issue**: Extension metrics not properly reset between tests, causing metric accumulation.

```typescript
// WRONG - Metrics accumulate across tests
describe('Extension Metrics Issues', () => {
  const mockMCPMon = new MockMCPMon(); // ❌ Shared mock
  
  it('first test processes 5 messages', async () => {
    // Process 5 messages
    const metrics = mockMCPMon.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(5);
  });
  
  it('second test processes 3 messages', async () => {
    // Process 3 more messages
    const metrics = mockMCPMon.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(3); // ❌ FAILS - is 8 (5+3)
  });
});
```

**Solution**: Reset metrics between tests or use fresh instances:

```typescript
// CORRECT - Clean metrics per test
describe('Extension Metrics Clean', () => {
  let mockMCPMon: MockMCPMon;
  
  beforeEach(() => {
    mockMCPMon = new MockMCPMon(); // ✅ Fresh instance
  });
  
  afterEach(async () => {
    await mockMCPMon.cleanup(); // ✅ Clean metrics
  });
  
  it('each test has clean metrics', async () => {
    const metrics = mockMCPMon.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(0); // ✅ Always starts at 0
  });
});
```

### Mock Implementation Examples

Complete examples showing how to use mock implementations for different testing scenarios:

```typescript
import { MockChangeSource } from '../src/testing/mocks/MockChangeSource';
import { MockFileSystem } from '../src/testing/mocks/MockFileSystem';

describe('Mock Examples - File System Operations', () => {
  it('demonstrates file system mocking with change detection', async () => {
    const container = new TestContainer({ mode: 'mock' });
    
    try {
      const fs = container.get<MockFileSystem>('file-system');
      const changeSource = container.get<MockChangeSource>('change-source');
      const mcpmon = container.get<MockMCPMon>('mcpmon');
      
      // Setup file system state
      fs.setFileContent('/test/server.js', 'console.log("v1");');
      fs.setFileContent('/test/config.json', '{"version": 1}');
      
      // Configure change source
      changeSource.setWatchTargets(['/test/server.js', '/test/config.json']);
      changeSource.setDebounceDelay(100);
      
      // Start monitoring
      await mcpmon.start();
      
      // Simulate file modification
      fs.setFileContent('/test/server.js', 'console.log("v2");');
      changeSource.simulateChange({
        type: 'file',
        operation: 'modify',
        path: '/test/server.js'
      });
      
      // Wait for debounced restart
      await mcpmon.waitForStable(150);
      
      // Verify file system interaction
      expect(fs.getReadCount('/test/server.js')).toBeGreaterThan(0);
      expect(fs.getFileContent('/test/server.js')).toBe('console.log("v2");');
      
      // Verify restart triggered
      expect(mcpmon.getRestartCount()).toBe(1);
      
      // Verify change source metrics
      const changeMetrics = changeSource.getMetrics();
      expect(changeMetrics.totalChanges).toBe(1);
      expect(changeMetrics.fileChanges).toBe(1);
      expect(changeMetrics.debounceCount).toBe(1);
    } finally {
      await container.cleanup();
    }
  });
});
```

### TestHarness Usage Scenarios

Complete examples showing TestHarness usage for integration and soak testing:

#### Integration Testing with TestHarness

```typescript
import { TestHarness } from '../src/testing/TestHarness';
import { TestConfig } from '../src/testing/types';

describe('TestHarness Examples - Integration Testing', () => {
  let harness: TestHarness;
  
  beforeEach(async () => {
    const config: TestConfig = {
      mode: 'integration',
      timeout: 10000,
      cleanup: true,
      extensions: ['large-response-handler']
    };
    
    harness = new TestHarness(config);
    
    await harness.start({
      command: 'node',
      args: ['tests/fixtures/mcp-server-v1.js'],
      watchTargets: ['tests/fixtures/mcp-server-v1.js']
    });
  });
  
  afterEach(async () => {
    await harness.cleanup();
  });

  it('demonstrates real MCP protocol integration', async () => {
    // Test complete MCP handshake
    const initResponse = await harness.initialize({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} }
    });
    
    expect(initResponse.protocolVersion).toBe('2024-11-05');
    expect(initResponse.capabilities.tools).toBeDefined();
    
    // Test tool discovery
    const toolsResponse = await harness.listTools();
    expect(toolsResponse.tools).toHaveLength(1);
    expect(toolsResponse.tools[0].name).toBe('test-tool');
    
    // Test tool execution
    const callResponse = await harness.callTool('test-tool', {
      parameter: 'test-value'
    });
    
    expect(callResponse.content).toBeDefined();
    expect(callResponse.content[0].text).toBe('Result A');
    
    // Verify extension metrics
    const metrics = harness.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBeGreaterThan(0);
    expect(metrics.averageResponseTime).toBeGreaterThan(0);
  });

  it('demonstrates hot-reload with real file system', async () => {
    // Get initial response
    let response = await harness.callTool('test-tool', {});
    expect(response.content[0].text).toBe('Result A');
    
    // Trigger real file change
    await harness.replaceFile(
      'tests/fixtures/mcp-server-v1.js',
      'tests/fixtures/mcp-server-v2.js'
    );
    
    // Wait for restart to complete
    await harness.waitForRestart();
    
    // Verify updated response
    response = await harness.callTool('test-tool', {});
    expect(response.content[0].text).toBe('Result B');
    
    // Restore original file
    await harness.replaceFile(
      'tests/fixtures/mcp-server-v2.js',
      'tests/fixtures/mcp-server-v1.js'
    );
    
    await harness.waitForRestart();
    
    // Verify restoration
    response = await harness.callTool('test-tool', {});
    expect(response.content[0].text).toBe('Result A');
  });
});
```

#### Soak Testing with TestHarness

```typescript
describe('TestHarness Examples - Soak Testing', () => {
  let harness: TestHarness;
  
  beforeAll(async () => {
    const config: TestConfig = {
      mode: 'soak',
      timeout: 300000, // 5 minutes
      cleanup: true,
      extensions: ['large-response-handler']
    };
    
    harness = new TestHarness(config);
    
    await harness.start({
      command: 'node',
      args: ['tests/fixtures/mcp-server-v1.js'],
      watchTargets: ['tests/fixtures/mcp-server-v1.js']
    });
  });
  
  afterAll(async () => {
    await harness.cleanup();
  });

  it('demonstrates sustained load testing', async () => {
    const messageCount = 1000;
    const startTime = Date.now();
    
    // Send sustained message load
    for (let i = 0; i < messageCount; i++) {
      await harness.sendMessage({
        method: 'tools/call',
        params: { 
          name: 'test-tool',
          iteration: i,
          timestamp: Date.now()
        }
      });
      
      // Brief pause every 100 messages to prevent overwhelming
      if (i % 100 === 0) {
        await harness.waitForStable(50);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify system stability
    const systemMetrics = harness.getSystemMetrics();
    expect(systemMetrics.memoryUsage).toBeLessThan(100 * 1024 * 1024); // < 100MB
    expect(systemMetrics.errorCount).toBe(0);
    expect(systemMetrics.avgResponseTime).toBeLessThan(1000); // < 1s average
    
    // Verify throughput
    const throughput = messageCount / (duration / 1000);
    expect(throughput).toBeGreaterThan(5); // > 5 messages/second
    
    // Verify extension stability
    const extensionMetrics = harness.getExtensionMetrics('large-response-handler');
    expect(extensionMetrics.messagesProcessed).toBe(messageCount);
    expect(extensionMetrics.errorCount).toBe(0);
  });
});
```

### Extension Testing Examples

Complete examples demonstrating how to test extensions using dependency injection and various testing frameworks:

#### Extension Test Suite Registration

```typescript
// src/extensions/large-response-handler/tests/index.ts
import { TestSuite, TestConfig } from '../../../testing/types';

export const testSuite: TestSuite = {
  name: 'large-response-handler',
  description: 'Tests for Large Response Handler Extension',
  
  // Test configuration with DI setup
  config: {
    mode: 'soak',
    timeout: 30000,
    cleanup: true,
    extensions: ['large-response-handler'],
    dependencies: {
      'response-handler': 'chunked-response-handler',
      'threshold-manager': 'env-threshold-manager'
    }
  },

  // Extension-specific test cases
  tests: [
    {
      name: 'handles large responses correctly with DI',
      fn: async (harness) => {
        // Test with injected dependencies
        const largeResponse = 'x'.repeat(30000); // 30KB
        const result = await harness.sendMessage({
          method: 'tools/call',
          params: { name: 'large-tool', response: largeResponse }
        });
        
        expect(result.content[0].text).toBe(largeResponse);
        expect(result.isChunked).toBe(true);
        
        // Verify DI component interaction
        const thresholdManager = harness.getDependency('threshold-manager');
        expect(thresholdManager.getThreshold()).toBe(25 * 1024); // 25KB
      }
    },
    {
      name: 'chunks responses over threshold with custom DI',
      fn: async (harness) => {
        // Configure custom dependency
        const customHandler = new ChunkedResponseHandler({
          chunkSize: 10 * 1024, // 10KB chunks
          maxChunks: 5
        });
        harness.registerDependency('response-handler', customHandler);
        
        const hugeResponse = 'x'.repeat(50000); // 50KB
        const result = await harness.sendMessage({
          method: 'tools/call',
          params: { name: 'huge-tool', response: hugeResponse }
        });
        
        expect(result.isChunked).toBe(true);
        expect(result.chunks).toHaveLength(5); // 50KB / 10KB = 5 chunks
        
        // Verify custom handler usage
        expect(customHandler.getProcessedCount()).toBe(1);
      }
    }
  ]
};
```

#### Extension Unit Testing with MockMCPMon

```typescript
import { TestContainer } from '../../../testing/TestContainer';
import { MockMCPMon } from '../../../testing/MockMCPMon';
import { LargeResponseHandlerExtension } from '../index';

describe('Extension Examples - Unit Testing', () => {
  let container: TestContainer;
  let mockMCPMon: MockMCPMon;
  let extension: LargeResponseHandlerExtension;
  
  beforeEach(() => {
    container = new TestContainer({ mode: 'mock' });
    mockMCPMon = container.get<MockMCPMon>('mcpmon');
    
    // Create extension with DI
    extension = new LargeResponseHandlerExtension({
      threshold: 25 * 1024, // 25KB
      chunkSize: 10 * 1024, // 10KB chunks
      dependencies: container
    });
    
    mockMCPMon.registerExtension(extension);
  });
  
  afterEach(async () => {
    await container.cleanup();
  });

  it('processes messages below threshold without chunking', async () => {
    const smallResponse = 'x'.repeat(10000); // 10KB (below 25KB threshold)
    
    const result = await mockMCPMon.processMessage({
      method: 'tools/call',
      params: { name: 'small-tool', response: smallResponse }
    });
    
    // Verify no chunking occurred
    expect(result.isChunked).toBe(false);
    expect(result.content[0].text).toBe(smallResponse);
    expect(result.chunks).toBeUndefined();
    
    // Verify extension metrics
    const metrics = mockMCPMon.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(1);
    expect(metrics.chunkedMessages).toBe(0);
  });

  it('chunks messages above threshold correctly', async () => {
    const largeResponse = 'x'.repeat(30000); // 30KB (above 25KB threshold)
    
    const result = await mockMCPMon.processMessage({
      method: 'tools/call',
      params: { name: 'large-tool', response: largeResponse }
    });
    
    // Verify chunking occurred
    expect(result.isChunked).toBe(true);
    expect(result.chunks).toHaveLength(3); // 30KB / 10KB = 3 chunks
    
    // Verify chunk content
    const reconstructed = result.chunks.map(chunk => chunk.content).join('');
    expect(reconstructed).toBe(largeResponse);
    
    // Verify extension metrics
    const metrics = mockMCPMon.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(1);
    expect(metrics.chunkedMessages).toBe(1);
    expect(metrics.totalChunks).toBe(3);
  });

  it('handles extension configuration via environment variables', async () => {
    // Mock environment configuration
    const envManager = container.get('env-manager');
    envManager.setEnvironmentVariable('MCPMON_RESPONSE_THRESHOLD', '50000'); // 50KB
    
    // Recreate extension with new config
    extension = new LargeResponseHandlerExtension({
      dependencies: container
    });
    mockMCPMon.registerExtension(extension);
    
    const response40KB = 'x'.repeat(40000); // 40KB (below new 50KB threshold)
    
    const result = await mockMCPMon.processMessage({
      method: 'tools/call',
      params: { name: 'medium-tool', response: response40KB }
    });
    
    // Should not be chunked due to higher threshold
    expect(result.isChunked).toBe(false);
    expect(result.content[0].text).toBe(response40KB);
  });
});
```

#### Extension Integration Testing

```typescript
describe('Extension Examples - Integration Testing', () => {
  let harness: TestHarness;
  
  beforeEach(async () => {
    const config: TestConfig = {
      mode: 'integration',
      timeout: 15000,
      cleanup: true,
      extensions: ['large-response-handler'],
      dependencies: {
        'file-system': 'node-file-system',
        'process-manager': 'node-process-manager'
      }
    };
    
    harness = new TestHarness(config);
    
    await harness.start({
      command: 'node',
      args: ['tests/fixtures/large-response-server.js'],
      watchTargets: ['tests/fixtures/large-response-server.js']
    });
  });
  
  afterEach(async () => {
    await harness.cleanup();
  });

  it('integrates extension with real MCP server', async () => {
    // Request a large response from real server
    const response = await harness.callTool('generate-large-content', {
      size: 35000 // 35KB
    });
    
    // Verify extension processed the response
    expect(response.isChunked).toBe(true);
    expect(response.chunks).toHaveLength(4); // 35KB / 10KB ≈ 4 chunks
    
    // Verify real system metrics
    const systemMetrics = harness.getSystemMetrics();
    expect(systemMetrics.memoryUsage).toBeLessThan(50 * 1024 * 1024); // < 50MB
    
    // Verify extension integration metrics
    const extensionMetrics = harness.getExtensionMetrics('large-response-handler');
    expect(extensionMetrics.messagesProcessed).toBe(1);
    expect(extensionMetrics.averageResponseTime).toBeGreaterThan(0);
  });

  it('handles extension configuration changes via file system', async () => {
    // Modify extension configuration file
    await harness.writeFile('config/extensions.json', JSON.stringify({
      'large-response-handler': {
        threshold: 20000, // 20KB
        chunkSize: 5000   // 5KB chunks
      }
    }));
    
    // Wait for configuration reload
    await harness.waitForStable(1000);
    
    // Test with new configuration
    const response = await harness.callTool('generate-large-content', {
      size: 25000 // 25KB (above new 20KB threshold)
    });
    
    // Verify new chunking behavior
    expect(response.isChunked).toBe(true);
    expect(response.chunks).toHaveLength(5); // 25KB / 5KB = 5 chunks
  });
});
```

#### Extension Test Discovery and Execution

```typescript
// tests/extensions/test-runner.ts
import { TestRunner } from '../../src/testing/TestRunner';
import { TestConfig } from '../../src/testing/types';

describe('Extension Examples - Test Discovery', () => {
  let runner: TestRunner;
  
  beforeEach(() => {
    const globalConfig: TestConfig = {
      mode: 'soak',
      timeout: 60000,
      cleanup: true,
      parallel: false,
      extensions: ['*'], // Test all extensions
      dependencies: {
        'response-handler': 'mock-response-handler',
        'threshold-manager': 'mock-threshold-manager'
      }
    };
    
    runner = new TestRunner(globalConfig);
  });

  it('discovers and runs all extension test suites', async () => {
    // Auto-discover extension test suites
    await runner.discoverTestSuites('src/extensions/**/tests/index.ts');
    
    // Verify discovery
    const discoveredSuites = runner.getDiscoveredSuites();
    expect(discoveredSuites).toContain('large-response-handler');
    expect(discoveredSuites.length).toBeGreaterThan(0);
    
    // Run all extension tests
    const results = await runner.runAllSuites();
    
    // Verify execution results
    expect(results.totalSuites).toBe(discoveredSuites.length);
    expect(results.passedSuites).toBe(discoveredSuites.length);
    expect(results.failedSuites).toBe(0);
    
    // Verify per-suite results
    const suiteResult = results.suiteResults['large-response-handler'];
    expect(suiteResult.passed).toBe(true);
    expect(suiteResult.testsRun).toBeGreaterThan(0);
    expect(suiteResult.testsFailed).toBe(0);
  });

  it('runs specific extension test suite with custom config', async () => {
    // Override config for specific suite
    const suiteConfig: TestConfig = {
      mode: 'integration',
      timeout: 10000,
      cleanup: true,
      extensions: ['large-response-handler'],
      dependencies: {
        'response-handler': 'real-response-handler',
        'file-system': 'node-file-system'
      }
    };
    
    // Run specific extension with custom config
    const result = await runner.runSuite('large-response-handler', suiteConfig);
    
    // Verify execution
    expect(result.passed).toBe(true);
    expect(result.testsRun).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
    
    // Verify configuration was applied
    expect(result.config.mode).toBe('integration');
    expect(result.config.dependencies['response-handler']).toBe('real-response-handler');
  });

  it('handles extension test failures gracefully', async () => {
    // Configure failure simulation
    const failureConfig: TestConfig = {
      mode: 'mock',
      timeout: 5000,
      cleanup: true,
      extensions: ['large-response-handler'],
      simulateFailures: true,
      failureRate: 0.5 // 50% failure rate
    };
    
    const runner = new TestRunner(failureConfig);
    
    // Run with failure simulation
    const results = await runner.runAllSuites();
    
    // Verify failure handling
    expect(results.failedSuites).toBeGreaterThan(0);
    expect(results.totalSuites).toBeGreaterThan(0);
    
    // Verify detailed failure information
    const failedSuites = Object.entries(results.suiteResults)
      .filter(([_, result]) => !result.passed);
    
    expect(failedSuites.length).toBeGreaterThan(0);
    
    failedSuites.forEach(([suiteName, result]) => {
      expect(result.testsFailed).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
```

**Extension Testing Key Files:**
- `src/extensions/*/tests/index.ts` - Extension test suite definitions
- `src/testing/TestRunner.ts` - Extension test discovery and execution
- `src/testing/ExtensionTestHarness.ts` - Extension-specific testing utilities
- `tests/extensions/large-response-handler-di.test.ts` - Extension DI integration tests

**Extension Testing Characteristics:**
- **Dependency Injection**: Extensions use DI for all dependencies
- **Multiple Test Modes**: Unit, integration, and soak testing support
- **Configuration Management**: Environment and file-based configuration testing
- **Automatic Discovery**: Test suites are discovered and registered automatically
- **Failure Simulation**: Built-in failure injection for error path testing

## Testing Patterns

The mcpmon testing framework provides four distinct testing patterns through dependency injection, each optimized for different validation scenarios and performance requirements.

### Unit Testing with MockMCPMon

Unit tests provide fast, isolated validation of component behavior using MockMCPMon and mock dependencies. These tests focus on individual component logic without external dependencies.

#### Basic Unit Test Setup

```typescript
import { TestContainer } from '../src/testing/TestContainer';
import { MockMCPMon } from '../src/testing/MockMCPMon';

describe('Unit Tests - Extension Behavior', () => {
  let container: TestContainer;
  let mockMCPMon: MockMCPMon;

  beforeEach(() => {
    container = new TestContainer({ mode: 'mock' });
    mockMCPMon = container.get<MockMCPMon>('mcpmon');
  });

  afterEach(async () => {
    await container.cleanup();
  });

  it('handles large-response-handler extension correctly', async () => {
    // Configure mock behavior
    mockMCPMon.setResponseDelay(50);
    mockMCPMon.setMessageBufferSize(1000);
    
    // Register extension
    const extension = new LargeResponseHandlerExtension();
    mockMCPMon.registerExtension(extension);
    
    // Test extension behavior
    const largeResponse = 'x'.repeat(30000); // 30KB
    const result = await mockMCPMon.processMessage({
      method: 'tools/call',
      params: { name: 'large-tool', response: largeResponse }
    });
    
    // Verify extension processing
    expect(mockMCPMon.getExtensionCallCount()).toBe(1);
    expect(result.content[0].text).toBe(largeResponse);
    expect(result.isChunked).toBe(true);
  });
});
```

#### Advanced Unit Test Patterns

```typescript
describe('Unit Tests - Message Flow', () => {
  it('buffers messages during restart with DI', async () => {
    const container = new TestContainer({ mode: 'mock' });
    const mockMCPMon = container.get<MockMCPMon>('mcpmon');
    const mockChangeSource = container.get<ChangeSource>('change-source');
    
    try {
      // Start message buffering
      mockMCPMon.startMessageBuffering();
      
      // Send messages during restart
      await mockMCPMon.sendMessage({ method: 'tools/list' });
      await mockMCPMon.sendMessage({ method: 'tools/call', params: { name: 'test' } });
      
      // Simulate restart via change source
      mockChangeSource.simulateChange({
        type: 'file',
        operation: 'modify',
        path: '/test/server.js'
      });
      
      await mockMCPMon.simulateRestart();
      
      // Verify message replay
      const replayedMessages = mockMCPMon.getReplayedMessages();
      expect(replayedMessages).toHaveLength(2);
      expect(replayedMessages[0]).toMatchObject({ method: 'tools/list' });
      expect(replayedMessages[1]).toMatchObject({ method: 'tools/call' });
    } finally {
      await container.cleanup();
    }
  });
});
```

**Unit Test Characteristics:**
- **Fast execution** (< 100ms per test)
- **Isolated behavior** with no external dependencies
- **Deterministic results** through controlled mocking
- **High coverage** of edge cases and error conditions

### Integration Testing with TestHarness

Integration tests validate real component interactions using TestHarness with actual Node.js implementations. These tests verify end-to-end functionality with real file systems and process management.

#### Basic Integration Test Setup

```typescript
import { TestHarness } from '../src/testing/TestHarness';
import { TestConfig } from '../src/testing/types';

describe('Integration Tests - Real Components', () => {
  let harness: TestHarness;
  
  beforeEach(async () => {
    const config: TestConfig = {
      mode: 'integration',
      timeout: 5000,
      cleanup: true,
      extensions: ['large-response-handler']
    };
    
    harness = new TestHarness(config);
    
    await harness.start({
      command: 'node',
      args: ['tests/fixtures/mcp-server-v1.js'],
      watchTargets: ['tests/fixtures/mcp-server-v1.js']
    });
  });
  
  afterEach(async () => {
    await harness.cleanup();
  });

  it('processes real MCP messages with extensions', async () => {
    // Send real MCP message
    const response = await harness.sendMessage({
      method: 'tools/call',
      params: { name: 'test-tool' }
    });
    
    // Verify real response
    expect(response.content).toBeDefined();
    expect(response.content[0].text).toBe('Result A');
    
    // Verify extension metrics
    const metrics = harness.getExtensionMetrics('large-response-handler');
    expect(metrics.messagesProcessed).toBe(1);
    expect(metrics.averageResponseTime).toBeGreaterThan(0);
  });
});
```

#### File System Integration Tests

```typescript
describe('Integration Tests - File System', () => {
  it('detects real file changes and restarts server', async () => {
    const config: TestConfig = {
      mode: 'integration',
      timeout: 10000,
      cleanup: true
    };
    
    const harness = new TestHarness(config);
    
    try {
      // Start with v1 server
      await harness.start({
        command: 'node',
        args: ['tests/fixtures/mcp-server-v1.js'],
        watchTargets: ['tests/fixtures/mcp-server-v1.js']
      });
      
      // Verify initial response
      let response = await harness.sendMessage({
        method: 'tools/call',
        params: { name: 'test-tool' }
      });
      expect(response.content[0].text).toBe('Result A');
      
      // Trigger real file change
      await harness.replaceFile(
        'tests/fixtures/mcp-server-v1.js',
        'tests/fixtures/mcp-server-v2.js'
      );
      
      // Wait for restart
      await harness.waitForRestart();
      
      // Verify updated response
      response = await harness.sendMessage({
        method: 'tools/call',
        params: { name: 'test-tool' }
      });
      expect(response.content[0].text).toBe('Result B');
    } finally {
      await harness.cleanup();
    }
  });
});
```

**Integration Test Characteristics:**
- **Real implementations** with actual file I/O and process spawning
- **End-to-end validation** of complete workflows
- **Platform verification** across different operating systems
- **Moderate execution time** (1-5 seconds per test)

### Soak Testing with Persistent Systems

Soak tests validate system stability and performance over extended periods using persistent TestHarness instances. These tests identify memory leaks, resource exhaustion, and degradation under sustained load.

#### Basic Soak Test Setup

```typescript
describe('Soak Tests - System Stability', () => {
  let harness: TestHarness;
  
  beforeAll(async () => {
    const config: TestConfig = {
      mode: 'soak',
      timeout: 300000, // 5 minutes
      cleanup: true,
      extensions: ['large-response-handler']
    };
    
    harness = new TestHarness(config);
    
    await harness.start({
      command: 'node',
      args: ['tests/fixtures/mcp-server-v1.js'],
      watchTargets: ['tests/fixtures/mcp-server-v1.js']
    });
  });
  
  afterAll(async () => {
    await harness.cleanup();
  });

  it('handles sustained message load without degradation', async () => {
    const startTime = Date.now();
    const messageCount = 1000;
    const responses = [];
    
    // Send sustained message load
    for (let i = 0; i < messageCount; i++) {
      const response = await harness.sendMessage({
        method: 'tools/call',
        params: { name: 'test-tool', iteration: i }
      });
      responses.push(response);
      
      // Brief pause every 100 messages
      if (i % 100 === 0) {
        await harness.waitForStable(100);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify all responses received
    expect(responses).toHaveLength(messageCount);
    expect(responses.every(r => r.content[0].text === 'Result A')).toBe(true);
    
    // Verify system stability
    const metrics = harness.getSystemMetrics();
    expect(metrics.memoryUsage).toBeLessThan(100 * 1024 * 1024); // < 100MB
    expect(metrics.errorCount).toBe(0);
    expect(metrics.avgResponseTime).toBeLessThan(1000); // < 1s average
    
    // Verify throughput
    const throughput = messageCount / (duration / 1000);
    expect(throughput).toBeGreaterThan(10); // > 10 messages/second
  });
});
```

#### Memory Leak Detection

```typescript
describe('Soak Tests - Memory Management', () => {
  it('maintains stable memory usage over extended operation', async () => {
    const config: TestConfig = {
      mode: 'soak',
      timeout: 600000, // 10 minutes
      cleanup: true
    };
    
    const harness = new TestHarness(config);
    
    try {
      await harness.start({
        command: 'node',
        args: ['tests/fixtures/mcp-server-v1.js'],
        watchTargets: ['tests/fixtures/mcp-server-v1.js']
      });
      
      const memorySnapshots = [];
      
      // Monitor memory usage over time
      for (let minute = 0; minute < 10; minute++) {
        // Generate load for 1 minute
        for (let i = 0; i < 60; i++) {
          await harness.sendMessage({ method: 'tools/list' });
          await harness.waitForStable(1000); // 1 second intervals
        }
        
        // Take memory snapshot
        const metrics = harness.getSystemMetrics();
        memorySnapshots.push({
          minute,
          memoryUsage: metrics.memoryUsage,
          heapUsed: metrics.heapUsed
        });
      }
      
      // Verify memory stability
      const initialMemory = memorySnapshots[0].memoryUsage;
      const finalMemory = memorySnapshots[9].memoryUsage;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Allow for reasonable growth but detect leaks
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // < 50MB growth
      expect(finalMemory).toBeLessThan(200 * 1024 * 1024); // < 200MB total
    } finally {
      await harness.cleanup();
    }
  });
});
```

**Soak Test Characteristics:**
- **Extended duration** (5+ minutes per test)
- **Persistent system state** across multiple operations
- **Resource monitoring** for memory, CPU, and handles
- **Performance regression detection** over time

### E2E Testing with ClientSimulator

End-to-end tests validate complete user workflows using ClientSimulator, which simulates real MCP client behavior including connection management, protocol compliance, and error handling.

#### Basic E2E Test Setup

```typescript
import { ClientSimulator } from '../src/testing/ClientSimulator';
import { TestConfig } from '../src/testing/types';

describe('E2E Tests - Complete Workflows', () => {
  let clientSimulator: ClientSimulator;
  
  beforeEach(async () => {
    const config: TestConfig = {
      mode: 'e2e',
      timeout: 15000,
      cleanup: true,
      extensions: ['large-response-handler']
    };
    
    clientSimulator = new ClientSimulator(config);
    
    await clientSimulator.start({
      command: 'node',
      args: ['tests/fixtures/mcp-server-v1.js'],
      watchTargets: ['tests/fixtures/mcp-server-v1.js']
    });
  });
  
  afterEach(async () => {
    await clientSimulator.cleanup();
  });

  it('completes full MCP workflow with hot reload', async () => {
    // Initialize connection
    await clientSimulator.connect();
    
    // Complete MCP handshake
    const initResponse = await clientSimulator.initialize({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} }
    });
    expect(initResponse.protocolVersion).toBe('2024-11-05');
    
    // Discover available tools
    const toolsResponse = await clientSimulator.listTools();
    expect(toolsResponse.tools).toHaveLength(1);
    expect(toolsResponse.tools[0].name).toBe('test-tool');
    
    // Execute tool
    let callResponse = await clientSimulator.callTool('test-tool', {});
    expect(callResponse.content[0].text).toBe('Result A');
    
    // Trigger hot reload
    await clientSimulator.triggerFileChange('tests/fixtures/mcp-server-v1.js', {
      replaceWith: 'tests/fixtures/mcp-server-v2.js'
    });
    
    // Wait for reload completion
    await clientSimulator.waitForReload();
    
    // Verify connection persistence
    expect(clientSimulator.isConnected()).toBe(true);
    
    // Verify updated functionality
    callResponse = await clientSimulator.callTool('test-tool', {});
    expect(callResponse.content[0].text).toBe('Result B');
    
    // Verify no message loss
    const metrics = clientSimulator.getSessionMetrics();
    expect(metrics.messagesLost).toBe(0);
    expect(metrics.reconnectCount).toBe(0);
  });
});
```

#### Multi-Client E2E Tests

```typescript
describe('E2E Tests - Multi-Client Scenarios', () => {
  it('handles multiple concurrent clients during restart', async () => {
    const config: TestConfig = {
      mode: 'e2e',
      timeout: 20000,
      cleanup: true
    };
    
    const clients = [
      new ClientSimulator(config),
      new ClientSimulator(config),
      new ClientSimulator(config)
    ];
    
    try {
      // Start all clients
      await Promise.all(clients.map(client => 
        client.start({
          command: 'node',
          args: ['tests/fixtures/mcp-server-v1.js'],
          watchTargets: ['tests/fixtures/mcp-server-v1.js']
        })
      ));
      
      // Connect all clients
      await Promise.all(clients.map(client => client.connect()));
      
      // Send concurrent messages
      const messagePromises = clients.map((client, i) =>
        client.callTool('test-tool', { clientId: i })
      );
      
      // Trigger restart during message processing
      setTimeout(() => {
        clients[0].triggerFileChange('tests/fixtures/mcp-server-v1.js', {
          replaceWith: 'tests/fixtures/mcp-server-v2.js'
        });
      }, 1000);
      
      // Wait for all messages to complete
      const responses = await Promise.all(messagePromises);
      
      // Verify all clients received responses
      expect(responses).toHaveLength(3);
      responses.forEach((response, i) => {
        expect(response.content[0].text).toMatch(/Result [AB]/);
      });
      
      // Verify all clients maintained connection
      clients.forEach(client => {
        expect(client.isConnected()).toBe(true);
        
        const metrics = client.getSessionMetrics();
        expect(metrics.messagesLost).toBe(0);
      });
    } finally {
      await Promise.all(clients.map(client => client.cleanup()));
    }
  });
});
```

**E2E Test Characteristics:**
- **Complete user workflows** from connection to tool execution
- **Protocol compliance** validation including handshake sequences
- **Multi-client scenarios** testing concurrent connections
- **Real-world conditions** with network delays and failures

### DI Integration Examples

All testing patterns leverage dependency injection for consistent, configurable test execution:

#### Cross-Pattern DI Usage

```typescript
// Shared test configuration
const testConfig: TestConfig = {
  mode: 'integration',
  timeout: 10000,
  cleanup: true,
  extensions: ['large-response-handler'],
  dependencies: {
    'change-source': 'file-system',
    'process-manager': 'node-process-manager',
    'message-buffer': 'in-memory-buffer'
  }
};

// Unit test with DI
describe('Unit Tests with DI', () => {
  it('uses injected dependencies', async () => {
    const container = new TestContainer({ ...testConfig, mode: 'mock' });
    const mcpmon = container.get<MockMCPMon>('mcpmon');
    
    // Test uses injected mock dependencies
    await mcpmon.processMessage({ method: 'tools/list' });
    expect(mcpmon.getCallCount()).toBe(1);
  });
});

// Integration test with same DI config
describe('Integration Tests with DI', () => {
  it('uses injected real dependencies', async () => {
    const harness = new TestHarness(testConfig);
    
    // Same test logic, different implementations
    await harness.start({ command: 'node', args: ['server.js'] });
    const response = await harness.sendMessage({ method: 'tools/list' });
    expect(response.tools).toBeDefined();
  });
});
```

#### Custom DI Configurations

```typescript
// Extension-specific DI setup
const extensionTestConfig: TestConfig = {
  mode: 'soak',
  timeout: 60000,
  cleanup: true,
  extensions: ['large-response-handler'],
  dependencies: {
    'response-handler': 'chunked-response-handler',
    'threshold-manager': 'env-threshold-manager'
  }
};

// Custom dependency registration
const container = new TestContainer(extensionTestConfig);
container.register('response-handler', new ChunkedResponseHandler({
  chunkSize: 25 * 1024, // 25KB chunks
  maxChunks: 10
}));

container.register('threshold-manager', new EnvThresholdManager({
  defaultThreshold: 25 * 1024,
  envVariable: 'MCPMON_RESPONSE_THRESHOLD'
}));
```

**DI Framework Tests Key Files:**
- `src/testing/TestContainer.ts` - Central dependency injection container
- `src/testing/MockMCPMon.ts` - Comprehensive mock implementation
- `src/testing/TestHarness.ts` - Integration testing framework
- `src/testing/ClientSimulator.ts` - End-to-end testing client
- `src/testing/TestRunner.ts` - Extension test suite runner
- `tests/extensions/large-response-handler-di.test.ts` - Soak test runner

**DI Framework Characteristics:**
- **Consistent DI**: All tests use TestContainer for dependency management
- **Multiple Modes**: Support for unit, integration, soak, and e2e testing
- **Extension Support**: Built-in extension testing capabilities
- **Automatic Discovery**: Test suites are discovered and registered automatically
- **Configuration-Driven**: TestConfig interface enables selective test execution

## Test Helper Pattern

All behavioral tests use `test_helper.ts` to eliminate code duplication and improve reliability.

### Key Helper Functions

#### `setupProxyTest(config?)`

Creates a complete test environment with mocks and I/O streams:

```typescript
const { proxy, procManager, fs, teardown } = setupProxyTest({
  restartDelay: 100,
});
```

**Returns:**

- `proxy`: MCPProxy instance with injected dependencies
- `procManager`: MockProcessManager for process control
- `fs`: MockFileSystem for file operations
- `teardown`: Cleanup function (must be called in finally block)

#### `waitForSpawns(procManager, count)`

Deterministic waiting for process spawns:

```typescript
await waitForSpawns(procManager, 2); // Wait for 2 spawns
```

#### `simulateRestart(procManager, fs)`

Complete restart sequence with proper timing:

```typescript
await simulateRestart(procManager, fs, "/test/server.js");
```

#### `waitForStable(ms)`

Controlled timing for async operations:

```typescript
await waitForStable(100); // Replaces setTimeout patterns
```

### Benefits

1. **Significant code reduction** per behavioral test file
2. **Eliminates flaky setTimeout patterns** with event-driven waiting
3. **Removes brittle globalThis usage** with proper dependency injection
4. **Consistent teardown** prevents resource leaks between tests
5. **Deterministic timing** makes tests reliable across different systems

## Writing Tests

### Behavioral Test Template

```typescript
import { setupProxyTest, simulateRestart } from "./test_helper.js";
import { describe, it, expect } from '@jest/globals';

describe('Test Suite', () => {
  it('Feature - specific behavior description', async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100, // Configure test timing
    });

    try {
      // Arrange
      await proxy.start();
      const initialProcess = procManager.getLastSpawnedProcess();

      // Act
      await simulateRestart(procManager, fs);

      // Assert
      expect(procManager.getSpawnCallCount()).toBe(2);
      expect(initialProcess.killCalls.length).toBe(1);
    } finally {
      await teardown(); // Always clean up
    }
  });
});
```

### Best Practices

1. **Use setupProxyTest() for consistent setup**
   - Eliminates boilerplate
   - Ensures proper dependency injection
   - Provides consistent test environment

2. **Use helper functions instead of setTimeout**
   - `waitForSpawns()` for process operations
   - `waitForStable()` for general timing
   - `simulateRestart()` for restart sequences

3. **Always call teardown() in finally blocks**
   - Prevents resource leaks
   - Ensures clean test state
   - Avoids test interference

4. **Test behavior, not implementation details**
   - Focus on observable outcomes
   - Use mock methods to verify interactions
   - Avoid testing internal state

5. **Use descriptive test names**
   ```typescript
   "Proxy restart - file change triggers server restart sequence";
   "Message buffering - preserves order during restart";
   ```

### Testing Error Scenarios

For fault injection tests, configure mocks before setup:

```typescript
const { proxy, procManager, fs, teardown } = setupProxyTest();

// Configure failure
procManager.setSpawnShouldFail(true);

// Test error handling
await proxy.start();
// Assertions...
```

## Running Tests

### All Tests

```bash
npm test             # Runs clean + build + all tests
```

### Development Mode

```bash
npm run test:watch       # Watch mode for TDD (no clean/build)
```

### Coverage Report

```bash
npm run test:coverage    # Generate coverage report (no clean/build)
```

### Specific Test Files

```bash
npm test -- tests/behavior/proxy_restart.test.ts    # Includes clean + build
npm test -- tests/integration/cli.test.ts           # Includes clean + build

# For faster iteration without clean/build:
npm run test:unit                                   # Just behavioral tests
npm run test:integration                           # Just integration tests
```

## Test Coverage

Coverage includes:

- `src/proxy.ts` - Core proxy logic
- `src/cli.ts` - Integration tested
- `src/node/*.ts` - Integration tested

### Viewing Coverage

```bash
npm run test:coverage
# Coverage summary shown in terminal
```

## MCP Protocol Testing

### Test Fixtures

Pre-built MCP servers for testing:

- `tests/fixtures/mcp_server_v1.js` - Returns "Result A" from test_tool
- `tests/fixtures/mcp_server_v2.js` - Returns "Result B" from test_tool
- `tests/fixtures/mcp_client.js` - MCP client for end-to-end testing

### Protocol Implementation

Test servers implement essential MCP methods:

```javascript
// Initialize handshake
if (message.method === "initialize") {
  return { protocolVersion: "2024-11-05", capabilities: { tools: {} } };
}

// Tool discovery
if (message.method === "tools/list") {
  return { tools: [{ name: "test_tool", description: "..." }] };
}

// Tool execution - THIS IS WHAT CHANGES BETWEEN V1 AND V2
if (message.method === "tools/call" && toolName === "test_tool") {
  return { content: [{ type: "text", text: "Result A" }] }; // or "Result B"
}
```

### E2E Test Flow

The end-to-end test validates the complete hot-reload cycle:

1. **Setup Phase**: Start proxy with v1 server
2. **Initial Verification**: Verify "Result A" response
3. **Trigger Reload**: Swap to v2 server file
4. **Post-Reload Verification**: Verify "Result B" response
5. **Restore**: Return to v1 and verify "Result A"

This proves:

- File change detection works
- Client connection persists during restart
- Message buffering prevents data loss
- Server functionality changes are picked up

## Troubleshooting Tests

### Common Issues

1. **Test Timeouts**
   - Increase timeout values in helper functions
   - Check for missing process exits in tests
   - Ensure teardown is called properly

2. **Resource Leaks**
   - Always use finally blocks with teardown
   - Check for unclosed file watchers
   - Verify process cleanup

3. **Flaky Tests**
   - Replace setTimeout with helper functions
   - Use deterministic mock behaviors
   - Avoid timing-dependent assertions

### Debug Mode

Run tests with verbose output:

```bash
npm test -- --verbose    # Includes clean + build + verbose output
```

Or check console.error output in test files for debugging information.
