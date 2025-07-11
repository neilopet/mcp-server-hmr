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
- ~80% less boilerplate code compared to traditional test patterns

### Integration Tests (`tests/integration/`)

Integration tests with real implementations:

- **cli.test.ts** - Command-line interface testing
- **node_implementations.test.ts** - NodeFileSystem and NodeProcessManager tests

**Characteristics:**

- Tests real Node.js implementations
- Validates actual file I/O and process spawning
- Tests CLI argument parsing and behavior

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

1. **~80% code reduction** per behavioral test file
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

Current coverage targets:

- `src/proxy.ts` - ~60% coverage (core proxy logic)
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
