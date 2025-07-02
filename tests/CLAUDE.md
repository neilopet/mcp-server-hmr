# tests/ - Comprehensive Test Suite

## Purpose
Contains a comprehensive test suite that verifies mcpmon functionality through dependency injection and mock implementations. Uses Jest framework with behavioral and integration testing approaches.

## Directory Structure

### Behavioral Tests (`behavior/`)
Platform-agnostic tests using mock implementations:
- **Fast execution** - No real file I/O or process spawning
- **Deterministic timing** - Event-driven waiting instead of setTimeout
- **High coverage** - Tests core logic through interfaces
- **DRY pattern** - Uses `test_helper.ts` to eliminate boilerplate

### Mock Implementations (`mocks/`)
Controllable implementations for testing:
- **MockProcessManager** - Simulates process spawning and management
- **MockFileSystem** - In-memory file system with event triggering

### Test Fixtures (`fixtures/`)
Sample MCP servers for integration testing:
- **mcp_server_v1.js** - Returns "Result A" from test_tool
- **mcp_server_v2.js** - Returns "Result B" from test_tool (used for hot-reload validation)

## Key Files

### Core Test Infrastructure
- **`test_helper.ts`** - Shared test utilities following DRY principle (~80% code reduction)
- **`README.md`** - Test suite documentation and patterns

### Behavioral Test Files
- **`proxy_restart.test.ts`** - Server restart on file changes
- **`message_buffering.test.ts`** - Message queuing during restart
- **`initialization_replay.test.ts`** - MCP handshake preservation
- **`error_handling.test.ts`** - Fault tolerance and recovery scenarios
- **`error_scenarios.test.ts`** - Additional error path coverage
- **`generic_interfaces.test.ts`** - TDD tests for new generic monitoring interfaces

## Testing Philosophy

### Dependency Injection Testing
All tests use mock implementations injected through interfaces:

```typescript
// Test setup pattern
const { proxy, procManager, fs, teardown } = setupProxyTest({
  restartDelay: 100, // Fast timing for tests
});

try {
  // Test logic using injected mocks
  proxy.start();
  fs.triggerFileEvent("/test/server.js", "modify");
  await waitForSpawns(procManager, 2);
  
  // Assertions
  expect(procManager.getSpawnCallCount()).toBe(2);
} finally {
  await teardown(); // Always clean up
}
```

### Test Helper Pattern
The `test_helper.ts` eliminates boilerplate and provides:

```typescript
// Setup function
function setupProxyTest(config?: TestProxyConfig): TestContext;

// Timing helpers  
async function waitForSpawns(procManager: MockProcessManager, count: number): Promise<void>;
async function waitForStable(ms: number): Promise<void>;

// Complex operations
async function simulateRestart(procManager, fs, triggerFile?): Promise<void>;
```

### Benefits of This Approach
1. **~80% code reduction** compared to traditional test patterns
2. **Eliminates flaky setTimeout patterns** with event-driven waiting
3. **Removes brittle globalThis usage** with proper dependency injection
4. **Consistent teardown** prevents resource leaks between tests
5. **Deterministic timing** makes tests reliable across different systems

## Test Categories

### Behavioral Tests (Primary)
- ✅ **Platform-agnostic** - Test logic without platform dependencies
- ✅ **Fast execution** - Run in milliseconds with mocks
- ✅ **Comprehensive coverage** - All edge cases and error conditions
- ✅ **TDD-friendly** - Easy to write new tests

### Integration Tests (Secondary)
- ✅ **End-to-end validation** - Real file watching and process spawning
- ✅ **MCP protocol testing** - Actual JSON-RPC message flow
- ✅ **Hot-reload verification** - Complete cycle from file change to tool update

## Generic Interface Testing (NEW)

### TDD Test Coverage
The `generic_interfaces.test.ts` file provides comprehensive TDD coverage for:

```typescript
// Extended event types
const changeEvents: ChangeEventType[] = [
  'create', 'modify', 'remove',           // File operations
  'version_update', 'dependency_change'   // Package monitoring
];

// Multiple watch targets
const watchTargets = ['server.js', 'config.json', '@types/node'];

// Backward compatibility
const legacyConfig = { entryFile: 'server.js' };     // Still works
const newConfig = { watchTargets: ['server.js'] };   // New way
```

## Running Tests

```bash
# All tests (includes clean + build)
npm test

# Watch mode for TDD (no clean/build)
npm run test:watch

# Coverage report (no clean/build)
npm run test:coverage

# Specific suites (no clean/build for faster iteration)
npm run test:unit        # Behavioral tests
npm run test:integration # E2E tests
```

## Development Notes

### Adding New Tests
1. Use `setupProxyTest()` for consistent environment
2. Use helper functions instead of setTimeout
3. Always call `teardown()` in finally blocks
4. Focus on observable behavior, not implementation details

### Test Naming Convention
```typescript
"Feature - specific behavior description"
// Examples:
"Proxy restart - file change triggers server restart sequence"
"Message buffering - preserves order during restart"
"Error scenarios - handles server initialization failures"
"Generic interfaces - supports package monitoring event types"
```

### Mock Configuration
Mocks can be configured for various scenarios:
```typescript
// Error injection
procManager.setSpawnShouldFail(true);
fs.setFailures({ read: true, message: "Permission denied" });

// Timing simulation  
fs.setDelays({ read: 100, write: 50 });

// Event triggering
fs.triggerFileEvent("/test/server.js", "modify");
```

This test suite ensures mcpmon works reliably across all scenarios while maintaining fast feedback loops for development.