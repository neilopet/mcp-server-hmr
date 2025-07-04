# System Design: Testing Long-Running Applications

## Executive Summary

This document captures critical insights discovered while debugging test failures in mcpmon. What started as fixing flaky tests revealed a fundamental mismatch between our testing strategy and the reality of long-running system behavior.

## The Core Problem

### Discovery Through Failure

The issue surfaced when attempting to fix 5 failing tests:
1. We modified `MockMCPStream` to track pending operations
2. This fixed the target tests but broke 12+ others
3. Root cause: Shared test infrastructure with persistent state

### The Deeper Issue: Lifecycle Mismatch

**Production Reality:**
```
Application starts → Runs for days/weeks → Handles thousands of events → Eventually terminates
```

**Test Reality:**
```
Test 1: Start app → Run operation → Stop app
Test 2: Start app → Run operation → Stop app
Test 3: Start app → Run operation → Stop app
```

We were testing 261 mini-applications instead of one long-running system.

## Symptoms That Led to Discovery

### The Journey: From Tactical Fixes to Strategic Insights

#### Initial Failing Tests (5 issues)
1. **StreamingBuffer test** - Expected `warn` but got `info` log
   - **Fix**: Changed expectation to match actual behavior
   - **Still Relevant**: Yes - test was expecting wrong behavior
   
2. **Missing jsonrpc property** - Mock objects incomplete
   - **Fix**: Added `jsonrpc: '2.0' as const` to mock responses
   - **Still Relevant**: Yes - mocks must match interface contracts
   
3. **Missing getProgressNotifications()** - Method doesn't exist on interface
   - **Fix**: Used `getNotifications().filter()` instead
   - **Still Relevant**: Yes - use correct interface methods
   
4. **Duplicate @injectable() decorator** - Decorator conflict
   - **Fix**: Removed redundant decorator (TestContainer.register already applies it)
   - **Still Relevant**: Yes - avoid decorator duplication
   
5. **Timing issue** - 0ms duration in synchronous test
   - **Fix**: Added 1ms delay between operations
   - **Partially Superseded**: Better to use proper async testing patterns

#### The Failed "Solution" That Revealed the Real Problem
To fix tests expecting error simulation to reject promises, we modified `MockMCPStream`:
```typescript
// Added complex state tracking (DON'T DO THIS)
private pendingOperations: Set<{resolve, reject}> = new Set();
private lastError: Error | null = null;
```
**Result**: Fixed 5 tests but broke 12+ others!

**Lesson**: Modifying shared test infrastructure to fix specific tests is an anti-pattern.

### Immediate Symptoms
- Tests passing individually but failing when run together
- Stateful singletons accumulating data across tests
- Event handlers leaking between test executions
- DI container never resetting between tests

### Underlying Issues Found
1. **Stateful Singletons** - `@injectable` classes with Maps/Arrays persisting across all tests
2. **No Container Reset** - `TestContainer.reset()` exists but never called
3. **Event Handler Leaks** - Listeners added without cleanup
4. **Default Singleton Scope** - All DI services persist for entire test suite

## The Paradigm Shift

### From Feature Testing to Lifecycle Testing

The revelation: Tests should match the operational profile of the software, not just its functional requirements.

For mcpmon (a long-running proxy that persists for the lifetime of Claude Desktop):
- It doesn't restart between operations
- It accumulates state over time
- It must handle resource constraints
- It needs self-healing capabilities

## Proposed Testing Architecture

### Tier 1: Feature Tests (Current, but Fixed)
```javascript
beforeEach(() => {
  TestContainer.reset(); // Fresh container per test
});

afterEach(() => {
  TestContainer.reset(); // Cleanup
});
```
- **Purpose:** Test individual features in isolation
- **Lifecycle:** Fresh application instance per test
- **Duration:** Milliseconds to seconds

### Tier 2: System Lifecycle Tests (New)
```javascript
describe('System Endurance', () => {
  let proxy;
  
  beforeAll(async () => {
    proxy = await startMcpmon(); // Start ONCE
  });
  
  afterAll(async () => {
    await proxy.shutdown(); // Stop ONCE
  });
  
  it('should handle 1000 operations without degradation', async () => {
    for (let i = 0; i < 1000; i++) {
      await performOperation();
      if (i % 100 === 0) {
        assertNoMemoryGrowth();
        assertPerformanceStable();
      }
    }
  });
});
```
- **Purpose:** Test system behavior over extended operation
- **Lifecycle:** Single long-running instance
- **Duration:** Minutes to hours

### Tier 3: Endurance Tests (New)
- **Purpose:** Detect slow leaks and degradation
- **Lifecycle:** Single instance for days
- **Environment:** Nightly CI runs
- **Focus:** Resource usage, performance stability

## System Health Patterns

### Preventative Measures
1. **Resource Bounds** - Limit buffer sizes, connection counts
2. **Circuit Breakers** - Prevent cascade failures
3. **Periodic Cleanup** - Proactive maintenance routines
4. **Immutable State** - Prevent corruption through defensive copying

### Treatment Patterns
1. **Self-Healing** - Automatic recovery when problems detected
2. **Graceful Degradation** - Reduce functionality to maintain stability
3. **State Preservation** - Save/restore critical state across restarts
4. **Managed Restarts** - Graceful shutdown with connection draining

### Diagnostic Patterns
1. **Multi-Level Health Checks** - Liveness, readiness, detailed health
2. **Structured Observability** - Metrics, logs, traces with correlation
3. **State Inspection APIs** - Expose internal state safely
4. **Resource Monitoring** - Track memory, connections, performance

## Implementation Strategy

### Immediate Actions (Decided)
1. **Add global afterEach via setupFilesAfterEnv**
   - Create `jest.setup.ts` with implicit cleanup
   - Decision: Automatic cleanup preferred over explicit
   
2. **Change TestContainer defaultScope to 'Transient'**
   - Hard-code the change (property name implies configurability)
   - Decision: Test isolation by default

3. **Revert MockMCPStream state tracking**
   - Full revert of pendingOperations changes
   - Investigate why 2 tests expected stateful behavior
   - Decision: Mocks should be stateless

4. **Fix affected tests using "observe and adapt" approach**
   - Make changes, run tests, fix only actual failures
   - Decision: Targeted fixes over comprehensive audit

### Medium-Term Goals
1. **Build lifecycle test suite through composition**
   - Reuse existing integration tests with non-resetting container
   - Use decorators or configuration to compose soak tests
   - Example approach:
   ```typescript
   @SoakTest({ resetContainer: false })
   class ExistingIntegrationTest { }
   ```

2. Add health monitoring endpoints to mcpmon
3. Implement self-healing behaviors
4. Create endurance test infrastructure

### Long-Term Vision
Transform mcpmon from a simple proxy into a self-maintaining system that can run indefinitely with minimal human intervention.

### Guiding Principles (Established)
- **Magic is acceptable** when the alternative is unintuitive or high-touch
- **Mocks should be stateless** - state belongs in the system under test
- **Boy scout principle** for technical debt - improve what you touch
- **Practical isolation** over perfect isolation
- **Observe and adapt** over upfront comprehensive planning

## Relationship Between Tactical Fixes and Strategic Solutions

### Fixes That Remain Necessary
These issues exist regardless of test architecture:
- **Incorrect test expectations** (warn vs info) - Tests must match actual behavior
- **Incomplete mocks** (missing jsonrpc) - Mocks must implement full interface
- **Interface misuse** (getProgressNotifications) - Use correct methods
- **Decorator conflicts** (@injectable) - Framework-specific knowledge required

### Fixes Superseded by Architecture Changes
These issues disappear with proper test isolation:
- **Complex state tracking in mocks** - Not needed with fresh instances
- **Timing workarounds** - Proper async patterns in lifecycle tests
- **Manual state cleanup** - Automatic with container reset
- **Event handler removal** - Fresh instances have no leaked handlers

### The Correct Fix for MockMCPStream
Instead of complex state tracking, the client should manage its own state:
```typescript
// In MCPClientSimulator, not MockMCPStream
private state: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' = 'DISCONNECTED';
private lastError: Error | null = null;

async connect(): Promise<void> {
  if (this.state === 'ERROR') {
    throw this.lastError;
  }
  // ... normal connection logic
}
```

## Key Insights

1. **Testing Philosophy**: Tests should simulate the actual operational lifecycle, not idealized scenarios
2. **State Management**: Long-running systems need explicit state boundaries and cleanup strategies
3. **Observability First**: You cannot treat what you cannot diagnose
4. **Design for Longevity**: Build systems that maintain themselves over time

## Conclusion

The flaky test failures were a symptom of a deeper architectural mismatch. By aligning our testing strategy with the reality of long-running systems, we can build more resilient software that handles the challenges of extended operation.

This approach applies broadly to any long-running service, daemon, or proxy - not just mcpmon.