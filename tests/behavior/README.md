# Behavioral Tests Guide

This directory contains platform-agnostic behavioral tests that verify MCPProxy functionality through dependency injection and mock implementations.

## Quick Start

All behavioral tests follow this pattern:

```typescript
import { setupProxyTest, simulateRestart } from "./test_helper.ts";

Deno.test({
  name: "Feature - what it should do",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Your test logic here
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
```

## Test Helper Functions

### `setupProxyTest(config?)`

Creates a complete test environment with all necessary mocks:

```typescript
const { proxy, procManager, fs, teardown } = setupProxyTest({
  command: "node", // Default: "node"
  commandArgs: ["/test.js"], // Default: ["/test/server.js"]
  entryFile: "/test.js", // Default: "/test/server.js"
  restartDelay: 100, // Default: 50ms
  killDelay: 50, // Default: 50ms
  readyDelay: 50, // Default: 50ms
  env: { API_KEY: "test" }, // Default: {}
});
```

**Returns:**

- `proxy`: MCPProxy instance ready to test
- `procManager`: MockProcessManager for verifying process operations
- `fs`: MockFileSystem for simulating file events
- `teardown`: Cleanup function (MUST be called in finally block)

### `waitForSpawns(procManager, count, timeout?)`

Wait for a specific number of process spawns:

```typescript
await waitForSpawns(procManager, 2); // Wait for 2 spawns
await waitForSpawns(procManager, 1, 5000); // Wait up to 5 seconds
```

### `simulateRestart(procManager, fs, triggerFile?)`

Simulate a complete restart sequence:

```typescript
await simulateRestart(procManager, fs); // Uses default file
await simulateRestart(procManager, fs, "/custom/file.js");
```

This helper:

1. Triggers a file change event
2. Waits for restart to begin
3. Simulates process exit
4. Waits for new process spawn

### `waitForStable(ms)`

General-purpose timing control:

```typescript
await waitForStable(100); // Wait 100ms
```

## Writing Tests

### Basic Test Structure

```typescript
Deno.test({
  name: "Proxy restart - descriptive test name",
  async fn() {
    // 1. Setup
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // 2. Start proxy
      await proxy.start();

      // 3. Verify initial state
      assertEquals(procManager.getSpawnCallCount(), 1);
      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess);

      // 4. Perform action
      await simulateRestart(procManager, fs);

      // 5. Verify outcome
      assertEquals(procManager.getSpawnCallCount(), 2);
    } finally {
      // 6. Always cleanup
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
```

### Testing Process Behavior

```typescript
// Verify process was killed
const killCalls = initialProcess.killCalls || [];
assertEquals(killCalls.length, 1);
assertEquals(killCalls[0].signal, "SIGTERM");

// Simulate process output
initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\\n');

// Simulate process exit
initialProcess.simulateExit(0); // Normal exit
initialProcess.simulateExit(1, "SIGKILL"); // Error exit
```

### Testing File Events

```typescript
// Trigger file change
fs.triggerFileEvent("/test/server.js", "modify");

// Multiple rapid changes (for debouncing tests)
fs.triggerFileEvent("/test/server.js", "modify");
await waitForStable(10);
fs.triggerFileEvent("/test/server.js", "modify");
```

### Testing Error Scenarios

```typescript
// Configure spawn to fail
procManager.setSpawnShouldFail(true);

// Configure filesystem errors
fs.setFailures({
  read: true,
  write: true,
  exists: true,
  copy: true,
  message: "Mock filesystem error",
});
```

## Common Patterns

### Testing Message Buffering

```typescript
// Simulate messages during restart
const testMessage = {
  jsonrpc: "2.0",
  id: 123,
  method: "tools/list",
  params: {},
};

// Messages should be buffered during restart
// and replayed to new server
```

### Testing Initialization Replay

```typescript
// Simulate initialization response
const initResponse = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
  },
};

initialProcess.simulateStdout(JSON.stringify(initResponse) + "\\n");
```

### Testing Multiple Restarts

```typescript
// First restart
await simulateRestart(procManager, fs);
assertEquals(procManager.getSpawnCallCount(), 2);

// Second restart
const secondProcess = procManager.getLastSpawnedProcess();
secondProcess.simulateStdout('{"jsonrpc":"2.0","id":2,"result":{}}\\n');
await simulateRestart(procManager, fs);
assertEquals(procManager.getSpawnCallCount(), 3);
```

## Best Practices

1. **Always use finally blocks**
   ```typescript
   try {
     // Test logic
   } finally {
     await teardown();
   }
   ```

2. **Avoid setTimeout**
   ```typescript
   // ❌ Bad
   await new Promise((resolve) => setTimeout(resolve, 100));

   // ✅ Good
   await waitForStable(100);
   await waitForSpawns(procManager, 2);
   ```

3. **Use descriptive test names**
   ```typescript
   // ❌ Bad
   "test restart";

   // ✅ Good
   "Proxy restart - file change triggers server restart sequence";
   ```

4. **Verify process cleanup**
   ```typescript
   // Ensure process exits before teardown
   const lastProcess = procManager.getLastSpawnedProcess();
   if (lastProcess) {
     lastProcess.simulateExit(0);
   }
   ```

5. **Test one behavior per test**
   - Keep tests focused and independent
   - Use multiple tests for different scenarios
   - Don't test implementation details

## Debugging Tests

### Enable verbose output

```typescript
console.error("Spawn count:", procManager.getSpawnCallCount());
console.error("Process calls:", procManager.getSpawnCalls());
```

### Check mock state

```typescript
// Process manager state
procManager.getSpawnCallCount();
procManager.getLastSpawnedProcess();
procManager.getSpawnCalls();

// File system state
fs.getActiveWatcherCount();
fs.getWatchedPaths();
```

### Common issues

1. **Test hangs**: Missing process exit simulation
2. **Flaky timing**: Use event-driven helpers, not setTimeout
3. **Resource leaks**: Missing teardown() call
4. **Spawn count mismatch**: Check for unexpected restarts

## Test Files Overview

- **proxy_restart.test.ts**: Core restart functionality
- **message_buffering.test.ts**: Message queuing during restart
- **initialization_replay.test.ts**: MCP handshake preservation
- **error_handling.test.ts**: Fault tolerance scenarios
- **config_transformation.test.ts**: Config launcher behavior

Each test file focuses on a specific aspect of proxy behavior, using the test helper pattern for consistency and maintainability.
