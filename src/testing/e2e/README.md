# E2E MCP Client Simulator

A comprehensive end-to-end testing framework for MCP (Model Context Protocol) clients. This module provides realistic client simulation for thorough testing of MCP servers and proxy implementations.

## Features

### Client Simulators

- **Claude Desktop Simulator**: Mimics Claude Desktop behavior with retry logic and specific capabilities
- **MCP Inspector Simulator**: Developer tool patterns with detailed logging and protocol validation
- **Custom Client Simulator**: Configurable behavior for testing edge cases and custom scenarios

### Protocol Support

- Full MCP protocol flow implementation
- Connection establishment and initialization handshake
- Tool listing and discovery
- Tool calling with streaming support
- Progress notification handling
- Error handling and recovery

### Communication

- **Mock Streams**: For unit testing and isolated scenarios
- **Network Streams**: For integration testing with real servers
- **Custom Streams**: Extensible interface for specialized testing needs

### Scenario Testing

- Declarative scenario building
- Step-by-step execution
- Assertion verification
- Message capture and analysis

## Quick Start

### Basic Client Simulation

```typescript
import { E2ETestContextFactory } from './e2e/index.js';

// Create test context
const context = E2ETestContextFactory.createMockContext();

// Simulate Claude Desktop client
const client = context.simulateClient('claude-desktop');

// Connect and initialize
await client.connect();
await client.initialize({
  experimental: {},
  sampling: {},
  roots: { listChanged: true }
});

// Call tools
const tools = await client.listTools();
const result = await client.callTool('test-tool', { input: 'hello' });

// Check notifications
const notifications = client.getNotifications();

// Cleanup
await client.disconnect();
```

### Scenario-Based Testing

```typescript
import { E2EScenarioBuilder } from './e2e/index.js';

// Build complex scenario
const scenario = new E2EScenarioBuilder('Full Client Flow')
  .connect(100)
  .initialize({
    experimental: {},
    sampling: {}
  }, 200)
  .callTool('list-files', { directory: '/test' })
  .callTool('read-file', { path: '/test/file.txt' }, 'progress-token-1')
  .expectNotification('tools/list_changed')
  .expectResponse({ success: true })
  .wait(500)
  .disconnect()
  .build();

// Execute scenario
const result = await context.runScenario(scenario);
console.log('Scenario success:', result.success);
console.log('Errors:', result.errors);
console.log('Captured messages:', result.capturedMessages);
```

### Custom Client Configuration

```typescript
// Create custom client with specific behavior
const customClient = context.createCustomClient({
  name: 'test-client',
  version: '2.0.0',
  initializationDelay: 500,
  responseTimeout: 30000,
  capabilities: {
    experimental: {
      customFeature: { enabled: true }
    }
  }
});

// Add custom behaviors
if (customClient instanceof CustomClientSimulator) {
  customClient.addCustomBehavior('specialOperation', async (data) => {
    return `Processed: ${data}`;
  });
  
  const result = await customClient.executeCustomBehavior('specialOperation', 'test');
}
```

## Client Types

### Claude Desktop Simulator

Simulates the behavior of Claude Desktop with:
- Automatic retry logic for failed requests
- Specific initialization capabilities
- Realistic delays and timeouts
- Error recovery patterns

```typescript
const client = context.simulateClient('claude-desktop');
// Inherits retry behavior and Claude-specific capabilities
```

### MCP Inspector Simulator

Simulates developer tools with:
- Detailed request/response logging
- Protocol validation capabilities
- Inspector-specific features
- Debugging-oriented behavior

```typescript
const client = context.simulateClient('mcp-inspector');
if (client instanceof MCPInspectorSimulator) {
  const isValid = await client.validateProtocol();
}
```

### Custom Client Simulator

Fully configurable client for:
- Testing edge cases
- Custom protocol extensions
- Specific client behaviors
- Performance testing scenarios

```typescript
const client = context.createCustomClient({
  name: 'edge-case-client',
  version: '1.0.0',
  // Custom configuration...
});
```

## Stream Communication

### Mock Streams

For isolated testing:

```typescript
import { MockMCPStream } from './e2e/index.js';

const stream = new MockMCPStream();

// Set up message handling
stream.onMessage((message) => {
  console.log('Received:', message);
});

// Simulate messages
stream.simulateMessage('{"jsonrpc": "2.0", "method": "test"}');
stream.simulateError(new Error('Test error'));
stream.simulateClose();
```

### Network Streams

For integration testing:

```typescript
import { NetworkMCPStream } from './e2e/index.js';

const stream = new NetworkMCPStream(stdin, stdout);
// Communicates with real MCP server
```

## Progress Tracking

Track progress notifications by token:

```typescript
// Call tool with progress token
await client.callTool('long-operation', { data: 'test' }, 'progress-123');

// Get progress notifications for specific token
const progress = client.getProgressNotifications('progress-123');
progress.forEach(notification => {
  console.log(`Progress: ${notification.params.progress}/${notification.params.total}`);
});

// Get all progress notifications
const allProgress = client.getProgressNotifications();
```

## Error Handling

### Connection Errors

```typescript
try {
  await client.connect();
} catch (error) {
  console.error('Connection failed:', error);
  // Handle connection failure
}
```

### Tool Call Errors

```typescript
try {
  const result = await client.callTool('risky-tool', { data: 'test' });
} catch (error) {
  console.error('Tool call failed:', error);
  // Handle tool error
}
```

### Timeout Handling

```typescript
const client = context.createCustomClient({
  name: 'timeout-client',
  version: '1.0.0',
  responseTimeout: 5000 // 5 second timeout
});

// Will timeout if server doesn't respond in time
```

## Integration with Test Frameworks

### Jest Integration

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('MCP Server Tests', () => {
  let context;
  let client;

  beforeEach(async () => {
    context = E2ETestContextFactory.createMockContext();
    client = context.simulateClient('claude-desktop');
    await client.connect();
    await client.initialize();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should handle tool calls correctly', async () => {
    const result = await client.callTool('test-tool', { input: 'test' });
    expect(result).toBeDefined();
    expect(result.content).toHaveLength(1);
  });
});
```

### Custom Test Runner Integration

```typescript
// Use with any test framework
const runE2ETest = async () => {
  const context = E2ETestContextFactory.createMockContext();
  
  const scenario = new E2EScenarioBuilder('Custom Test')
    .connect()
    .initialize()
    .callTool('test-tool', {})
    .expectNotification('tools/list_changed')
    .disconnect()
    .build();

  const result = await context.runScenario(scenario);
  return result.success;
};
```

## Advanced Usage

### Message Capture and Analysis

```typescript
// Capture and analyze all messages
const result = await context.runScenario(scenario);

result.capturedMessages.forEach(message => {
  console.log(`${message.type} (${message.direction}):`, message.message);
  console.log(`Timestamp: ${new Date(message.timestamp)}`);
});
```

### Custom Stream Factory

```typescript
// Create context with custom stream factory
const context = E2ETestContextFactory.createCustomContext(() => {
  return new MyCustomStream();
});
```

### Realistic Network Testing

```typescript
// Test against real server
const stdin = new WritableStream(/* ... */);
const stdout = new ReadableStream(/* ... */);
const context = E2ETestContextFactory.createNetworkContext(stdin, stdout);

const client = context.simulateClient('claude-desktop');
// Will communicate with real MCP server
```

## Best Practices

### Test Organization

1. **Unit Tests**: Use mock streams for isolated component testing
2. **Integration Tests**: Use network streams with test servers
3. **E2E Tests**: Use full scenarios with realistic client behavior

### Error Testing

1. Test connection failures
2. Test protocol errors
3. Test timeout scenarios
4. Test malformed message handling

### Performance Testing

1. Use custom clients with specific timing configurations
2. Test with large payloads
3. Test concurrent operations
4. Monitor progress notifications

### Client-Specific Testing

1. Test Claude Desktop retry behavior
2. Test Inspector validation features
3. Test custom client behaviors
4. Verify client-specific capabilities

## Troubleshooting

### Common Issues

1. **Stream Not Closing**: Always call `disconnect()` in test cleanup
2. **Message Timing**: Use appropriate delays in scenarios
3. **Mock Setup**: Ensure mock streams are properly configured
4. **Error Handling**: Wrap operations in try-catch blocks

### Debugging

1. Use MCP Inspector simulator for detailed logging
2. Check captured messages for protocol issues
3. Verify client capabilities and server responses
4. Monitor progress notifications for long operations

## API Reference

See the TypeScript definitions in `MCPClientSimulator.ts` for complete API documentation.

## Examples

See `MCPClientSimulator.test.ts` for comprehensive usage examples and test patterns.