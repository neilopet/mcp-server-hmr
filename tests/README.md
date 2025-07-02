# Test Suite

This directory contains comprehensive tests for the mcpmon project using Jest and Node.js.

## Running Tests

```bash
# Run all tests (includes build)
npm test

# Watch mode for TDD
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test suites
npm run test:unit        # Unit and behavioral tests
npm run test:integration # E2E integration tests
```

## Test Structure

### Behavioral Tests (`behavior/`)

Platform-agnostic tests using mock implementations and the `test_helper.js` pattern:

- **proxy_restart.test.ts** - Server restart on file changes
- **message_buffering.test.ts** - Message queuing during restart
- **initialization_replay.test.ts** - MCP handshake preservation
- **error_handling.test.ts** - Fault tolerance and recovery
- **generic_interfaces.test.ts** - TDD tests for new generic monitoring interfaces
- **error_handling.test.ts** - Fault tolerance and recovery
- **config_transformation.test.ts** - Config launcher functionality

#### Test Helper Pattern

All behavioral tests use `test_helper.js` to eliminate code duplication:

```typescript
import { setupProxyTest, simulateRestart, waitForSpawns } from "./test_helper.js";
import { describe, it, expect } from '@jest/globals';

describe('Test Suite', () => {
  it('Feature - specific behavior', async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      await proxy.start();
      await simulateRestart(procManager, fs);
      // Test assertions...
      expect(procManager.getSpawnCallCount()).toBe(2);
    } finally {
      await teardown();
    }
  });
});
```

**Key Helper Functions:**

- `setupProxyTest(config?)` - Creates test environment with mocks
- `waitForSpawns(procManager, count)` - Deterministic process waiting
- `simulateRestart(procManager, fs)` - Controlled restart sequence
- `waitForStable(ms)` - Replaces setTimeout patterns

### Integration Tests (`integration/`)

End-to-end tests with real MCP client/server communication:

- **e2e_reload_test.ts** - Full hot-reload flow validation
- **error_handling_test.ts** - Server failure recovery
- **debouncing_test.ts** - File change debouncing

### Unit Tests

Core functionality tests:

- **file_change_detection_test.ts** - File watching triggers
- **restart_sequence_test.ts** - Restart order validation
- **message_buffering_test.ts** - Message queue behavior

### Mock Implementations (`mocks/`)

Test doubles implementing platform interfaces:

- **MockProcessManager.ts** - Process spawning/management
- **MockFileSystem.ts** - File operations and watching

## Test Philosophy

Our test strategy prioritizes:

1. **Behavioral Testing** - Test through interfaces, not implementations
2. **Deterministic Timing** - Event-driven waiting, not fixed timeouts
3. **Resource Safety** - Proper cleanup in all test paths
4. **DRY Principles** - Shared helpers for common patterns

## Writing New Tests

When adding behavioral tests:

1. Use `setupProxyTest()` for consistent setup
2. Use helper functions instead of setTimeout
3. Always call `teardown()` in finally blocks
4. Test behavior, not implementation details

Example template:

```typescript
import { describe, it, expect } from '@jest/globals';
import { setupProxyTest, simulateRestart } from "./test_helper.js";

describe('Test Suite', () => {
  it('Feature - specific behavior', async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Arrange
      await proxy.start();

      // Act
      await simulateRestart(procManager, fs);

      // Assert
      expect(procManager.getSpawnCallCount()).toBe(2);
    } finally {
      await teardown();
    }
  });
});
```

## Test Coverage

We maintain >80% coverage on core logic:

- `src/proxy.ts` - MCPProxy class
- `src/config_launcher.ts` - Config management
- Node.js platform implementations

## Test Configuration

Tests are configured via `jest.config.js` with:

- TypeScript compilation
- Module resolution for Node.js
- Coverage reporting
- Test timeout settings

## Integration Testing

The integration tests use real Node.js processes and file system operations to validate end-to-end functionality, including the complete hot-reload cycle with actual MCP servers.