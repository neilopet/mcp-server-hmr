# tests/mocks/ - Mock Implementations

## Purpose
Contains controllable mock implementations that replace real platform dependencies during testing. These mocks provide deterministic behavior and detailed interaction tracking for comprehensive test coverage.

## Files

### Mock Implementations
- **`MockProcessManager.ts`** - Mock implementation of ProcessManager interface
- **`MockFileSystem.ts`** - Mock implementation of FileSystem interface (with ChangeSource compatibility)

## Core Design Principles

### Interface Compliance
All mocks implement the exact same interfaces as production code:

```typescript
// MockProcessManager implements ProcessManager
export class MockProcessManager implements ProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
}

// MockFileSystem implements FileSystem  
export class MockFileSystem implements FileSystem {
  async *watch(paths: string[]): AsyncIterable<FileEvent>;
  async readFile(path: string): Promise<string>;
  // ... other methods
}
```

### Controllable Behavior
Mocks can be configured to simulate various scenarios:

```typescript
// Success/failure control
procManager.setSpawnShouldFail(true);
fs.setFailures({ read: true, message: "Permission denied" });

// Timing simulation
fs.setDelays({ read: 100, write: 50 });

// State management
fs.setFileExists("/test/server.js", true);
fs.setFileContent("/config.json", "{}");
```

## MockProcessManager

### Capabilities
- **Process Simulation** - Creates mock ManagedProcess objects with controllable behavior
- **Spawn Tracking** - Records all spawn calls with arguments and options
- **Failure Injection** - Can be configured to fail process spawning
- **Process Lifecycle** - Simulates realistic process startup/shutdown timing

### Mock Process Features
```typescript
const process = procManager.getLastSpawnedProcess();

// Control process behavior
process.simulateExit(0);
process.simulateStdout('{"jsonrpc":"2.0","result":{}}\n');
process.simulateStderr("Server started");

// Track interactions
expect(process.killCalls.length).toBe(1);
expect(process.killCalls[0].signal).toBe("SIGTERM");
```

### Usage in Tests
```typescript
const { procManager } = setupProxyTest();

// Configure behavior
procManager.setSpawnShouldFail(false);

// Trigger operations
await proxy.start();

// Verify interactions
expect(procManager.getSpawnCallCount()).toBe(1);
expect(procManager.getSpawnCalls()[0].command).toBe("node");
```

## MockFileSystem

### Capabilities
- **In-Memory Storage** - Maintains files and directories in memory
- **Event Triggering** - Manually trigger file system events for testing
- **Operation Tracking** - Records all file operations for verification
- **Error Simulation** - Configurable failures for testing error handling
- **Timing Control** - Simulate slow I/O operations

### File System Simulation
```typescript
// Set up file system state
fs.setFileExists("/test/server.js", true);
fs.setFileContent("/test/server.js", "console.log('hello');");

// Trigger events
fs.triggerFileEvent("/test/server.js", "modify");

// Verify operations
expect(fs.readCalls.length).toBe(1);
expect(fs.readCalls[0].path).toBe("/test/server.js");
```

### Generic Interface Support (NEW)
MockFileSystem supports the new generic interface system:

```typescript
// Set up files for watching
fs.setFileExists("/test/package.json", true);

// Can be adapted to ChangeSource automatically
const changeSource = createFileSystemAdapter(fs);

// Or used directly in tests that need the new interface
for await (const event of changeSource.watch(["/test/package.json"])) {
  expect(event.type).toBe("modify");
  expect(event.path).toBe("/test/package.json");
}
```

### Advanced Features
```typescript
// Multiple watcher tracking
expect(fs.getActiveWatcherCount()).toBe(2);

// Operation timing
fs.setDelays({ read: 100 });
const start = Date.now();
await fs.readFile("/test/file");
expect(Date.now() - start).toBeGreaterThan(90);

// Error injection
fs.setFailures({ 
  write: true, 
  message: "Disk full" 
});
await expect(fs.writeFile("/test/file", "content")).rejects.toThrow("Disk full");
```

## Integration with Generic Interfaces

### Backward Compatibility Testing
The mocks help verify that the new generic interface system maintains backward compatibility:

```typescript
// Test legacy FileSystem interface
const fs = new MockFileSystem();
for await (const event of fs.watch(["/test/server.js"])) {
  expect(event).toMatchObject({
    type: "modify",
    path: "/test/server.js"
  });
}

// Test automatic adapter functionality
const deps = { procManager, fs }; // Uses legacy 'fs' property
const proxy = new MCPProxy(deps, config);
// Should automatically create ChangeSource adapter
```

### Extended Event Types
Mocks can simulate the new event types for testing:

```typescript
// FileSystem mock triggers standard events
fs.triggerFileEvent("/test/server.js", "modify");

// Future: Custom ChangeSource mocks could trigger extended events
// mockChangeSource.triggerChangeEvent("/test/package.json", "version_update", {
//   oldVersion: "1.0.0", 
//   newVersion: "1.1.0"
// });
```

## Development Benefits

### Fast Testing
- **No real I/O** - All operations are in-memory
- **Instant responses** - No waiting for actual file system or process operations
- **Deterministic** - Same input always produces same output

### Comprehensive Coverage
- **Error scenarios** - Easy to test edge cases and failure conditions
- **Timing control** - Test race conditions and timing-dependent behavior
- **State inspection** - Verify internal interactions and state changes

### Debug-Friendly
- **Operation logging** - All calls are recorded for inspection
- **State inspection** - Can examine mock state at any point
- **Predictable behavior** - No environmental factors affecting tests

## Best Practices

### Setup
```typescript
// Always use setupProxyTest() which configures mocks properly
const { proxy, procManager, fs, teardown } = setupProxyTest();

// Set up required files before testing
fs.setFileExists("/test/server.js", true);
```

### Verification
```typescript
// Verify behavior, not implementation
expect(procManager.getSpawnCallCount()).toBe(2); // Good
// expect(proxy.internalState).toBe(...); // Avoid this

// Use mock tracking capabilities
expect(fs.readCalls).toEqual([
  { path: "/test/server.js", timestamp: expect.any(Number) }
]);
```

### Cleanup
```typescript
// Always call teardown to prevent test interference
try {
  // Test logic
} finally {
  await teardown(); // Cleans up mocks and streams
}
```

These mocks enable fast, reliable, and comprehensive testing of mcpmon's core functionality.