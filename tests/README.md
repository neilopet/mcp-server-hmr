# Test Suite

This directory contains comprehensive tests for the MCP Server HMR project.

## Running Tests

```bash
# Run all tests (includes clean and build)
deno task test

# Quick test during development (no clean/build)
deno task test:quick

# Watch mode for TDD
deno task test:watch

# Generate coverage report
deno task test:coverage

# Run specific test suites
deno task test:unit        # Unit and behavioral tests
deno task test:integration # E2E integration tests
```

## Test Structure

### Behavioral Tests (`behavior/`)

Platform-agnostic tests using mock implementations and the `test_helper.ts` pattern:

- **proxy_restart.test.ts** - Server restart on file changes
- **message_buffering.test.ts** - Message queuing during restart
- **initialization_replay.test.ts** - MCP handshake preservation
- **error_handling.test.ts** - Fault tolerance and recovery
- **config_transformation.test.ts** - Config launcher functionality

#### Test Helper Pattern

All behavioral tests use `test_helper.ts` to eliminate code duplication:

```typescript
import { setupProxyTest, simulateRestart, waitForSpawns } from "./test_helper.ts";

const { proxy, procManager, fs, teardown } = setupProxyTest({
  restartDelay: 100,
});

try {
  await proxy.start();
  await simulateRestart(procManager, fs);
  // Test assertions...
} finally {
  await teardown();
}
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
Deno.test({
  name: "Feature - specific behavior",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Arrange
      await proxy.start();

      // Act
      await simulateRestart(procManager, fs);

      // Assert
      assertEquals(procManager.getSpawnCallCount(), 2);
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
```

## Test Coverage

We maintain >80% coverage on core logic:

- `src/proxy.ts` - MCPProxy class
- `src/config_launcher.ts` - Config management
- Platform implementations (Deno/Node)

## Test Permissions

Tests require these Deno permissions:

- `--allow-env` - Environment variables
- `--allow-read` - Read project files
- `--allow-write` - Temporary test files
- `--allow-run` - Process spawning
- `--allow-net` - MCP client/server communication
