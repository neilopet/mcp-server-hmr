# tests/behavior/ - Behavioral Test Suite

## Purpose
Contains platform-agnostic behavioral tests that verify MCPProxy functionality through dependency injection and mock implementations. These tests focus on **behavior verification** rather than implementation details.

## Key Philosophy

### Dependency Injection Testing
All tests use injected mock implementations instead of real platform dependencies:
- **MockProcessManager** instead of NodeProcessManager
- **MockFileSystem** instead of NodeFileSystem  
- **TransformStreams** instead of real stdio streams

### Test Helper Pattern (DRY Principle)
All tests use `test_helper.ts` to eliminate boilerplate and ensure consistent patterns:

```typescript
// Standard test pattern
const { proxy, procManager, fs, teardown } = setupProxyTest({
  restartDelay: 100, // Fast timing for tests
});

try {
  // Test logic here
} finally {
  await teardown(); // Always clean up
}
```

## Test Files

### Core Functionality Tests

#### `proxy_restart.test.ts`
- **File change detection** - Validates that file modifications trigger restarts
- **Debouncing logic** - Ensures multiple rapid changes result in single restart
- **Process lifecycle** - Verifies proper server startup/shutdown sequence
- **Error recovery** - Tests restart behavior when servers fail to start

#### `message_buffering.test.ts` 
- **Message queuing** - Ensures messages are buffered during server restarts
- **Order preservation** - Validates that message order is maintained
- **Buffer overflow** - Tests behavior when buffer limits are exceeded
- **Replay logic** - Verifies buffered messages are properly replayed

#### `initialization_replay.test.ts`
- **Handshake capture** - Tests that initialize parameters are captured
- **Parameter replay** - Validates initialize params are replayed to new server
- **Capability preservation** - Ensures client capabilities are maintained across restarts
- **Timeout handling** - Tests graceful handling of initialization timeouts

#### `error_handling.test.ts`
- **Process spawn failures** - Tests behavior when server command fails
- **File watching errors** - Validates handling of invalid watch paths
- **Stream errors** - Tests recovery from stdio stream failures  
- **Concurrent errors** - Ensures system stability under multiple error conditions

#### `generic_interfaces.test.ts` (NEW)
- **Extended event types** - Tests `version_update`, `dependency_change` events
- **Multiple watch targets** - Validates `watchTargets` array functionality
- **Backward compatibility** - Ensures `entryFile` still works
- **ChangeSource interface** - Tests new generic monitoring capabilities
- **Library usage patterns** - Validates `isRunning()` and enhanced configuration

### Shared Infrastructure

#### `test_helper.ts`
Provides DRY test utilities with ~80% code reduction:

```typescript
// Setup with dependency injection
function setupProxyTest(config?: TestProxyConfig): TestContext;

// Deterministic timing (replaces setTimeout patterns)
async function waitForSpawns(procManager: MockProcessManager, count: number): Promise<void>;
async function waitForStable(ms: number): Promise<void>;

// Complex operation simulation
async function simulateRestart(procManager, fs, triggerFile?, restartDelay?): Promise<void>;
```

#### `global.d.ts`
TypeScript declarations for Jest globals and test environment.

## Testing Benefits

### Speed and Reliability
- **Fast execution** - No real file I/O or process spawning (tests run in milliseconds)
- **Deterministic timing** - Event-driven waiting instead of brittle setTimeout
- **No flaky tests** - Mocks provide consistent, predictable behavior

### Comprehensive Coverage
- **All edge cases** - Easy to test error conditions with mocks
- **Platform independence** - Tests verify logic without platform-specific behavior
- **Resource safety** - Proper cleanup prevents test interference

### Developer Experience
- **TDD-friendly** - Easy to write tests before implementation
- **Clear patterns** - Consistent setup/teardown reduces cognitive load
- **Rich assertions** - Mock objects provide detailed interaction tracking

## Mock Capabilities

### MockProcessManager
```typescript
// Control process behavior
procManager.setSpawnShouldFail(true);
procManager.getSpawnCallCount();
procManager.getLastSpawnedProcess();

// Simulate process events
const process = procManager.getLastSpawnedProcess();
process.simulateExit(0);
process.simulateStdout('{"jsonrpc":"2.0"}\n');
```

### MockFileSystem  
```typescript
// File system setup
fs.setFileExists("/test/server.js", true);
fs.setFileContent("/test/config.json", "{}");

// Event triggering
fs.triggerFileEvent("/test/server.js", "modify");

// Error simulation
fs.setFailures({ read: true, message: "Permission denied" });

// Operation tracking
expect(fs.readCalls.length).toBe(1);
expect(fs.writeCalls[0].content).toBe("new content");
```

## Development Guidelines

### Writing New Tests
1. **Use setupProxyTest()** for consistent environment
2. **Use helper functions** instead of setTimeout for timing
3. **Always call teardown()** in finally blocks to prevent resource leaks
4. **Test observable behavior** not internal implementation details
5. **Use descriptive test names** that explain the expected behavior

### Test Structure Template
```typescript
import { setupProxyTest, simulateRestart } from "./test_helper.js";
import { describe, it, expect } from "@jest/globals";

describe("Feature Name", () => {
  it("should behave correctly under specific conditions", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

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

This directory ensures mcpmon's core logic works correctly across all scenarios while providing fast feedback for development.