# Large Response Handler Extension Tests

This directory contains comprehensive tests for the Large Response Handler (LRH) extension, migrated to use the new Dependency Injection (DI) testing framework.

## Test Structure

### Core Files

- **`index.ts`** - Main DI-based test suite with `@TestContainer.register` decorator
- **`providers.ts`** - ContainerModule providing LRH-specific test utilities and mocks
- **`register.ts`** - Test registration and DI framework setup
- **`unit.test.ts`** - Standalone unit tests that work independently
- **`streaming.test.ts`** - Focused tests for streaming buffer functionality

### Test Utilities

The test suite includes specialized utilities for LRH testing:

- **`LRHTestUtilities`** - Data generators and response simulators
- **`DuckDBMock`** - Mock implementation for DuckDB query testing
- **`StreamSimulator`** - Streaming response simulation utilities
- **`LRHMockMCPMon`** - Enhanced MockMCPMon with streaming support

## Test Coverage

### Core Functionality
- ✅ Extension initialization and configuration
- ✅ Large response detection based on size/token thresholds
- ✅ Tool-specific configuration overrides
- ✅ Extension metadata and schema validation

### Streaming Support
- ✅ Streaming buffer management
- ✅ Progress notification handling
- ✅ Chunk accumulation and assembly
- ✅ Buffer size limits and disk fallback
- ✅ Abandoned buffer cleanup
- ✅ Concurrent streaming requests

### Tool Integration
- ✅ Tool injection into `tools/list` responses
- ✅ `mcpmon_analyze-with-duckdb` tool handling
- ✅ `mcpmon_list-saved-datasets` tool handling
- ✅ Tool schema validation

### Progress Notifications
- ✅ Progress token tracking
- ✅ MCP progress notification formatting
- ✅ Update interval throttling
- ✅ Byte size formatting

### Integration Scenarios
- ✅ Complete large response workflow
- ✅ Real proxy integration testing
- ✅ Error handling and edge cases
- ✅ Performance with large datasets

## Running Tests

### Using the DI Framework

```bash
# Run all LRH tests through DI framework
npm test -- --testPathPattern="large-response-handler/tests"

# Run specific test suite
npm test -- src/extensions/large-response-handler/tests/index.ts
```

### Running Individual Test Files

```bash
# Unit tests only
npm test -- src/extensions/large-response-handler/tests/unit.test.ts

# Streaming tests only
npm test -- src/extensions/large-response-handler/tests/streaming.test.ts
```

### Using Custom Jest Config

```bash
# Run with LRH-specific Jest configuration
cd src/extensions/large-response-handler/tests
npx jest --config jest.config.js
```

## Test Data Generation

The test suite includes utilities for generating realistic test data:

```typescript
// Large response simulation
const largeResponse = lrhUtils.createLargeResponse(100); // 100KB response

// Streaming chunks
const chunks = lrhUtils.createStreamingChunks(1000, 50); // 1000 items in 50-item chunks

// Mock datasets
const dataset = lrhUtils.createMockDataset({
  tool: 'my-tool',
  sizeKB: 25,
  itemCount: 500
});
```

## Mock Implementations

### DuckDB Mock
Simulates DuckDB query execution for testing analysis features:

```typescript
duckDBMock.mockQueryResult('SELECT COUNT(*) FROM test', [{ count: 100 }]);
const result = await duckDBMock.executeDuckDBQuery('test.db', 'SELECT COUNT(*) FROM test');
```

### Stream Simulator
Creates realistic streaming scenarios:

```typescript
const buffer = streamSimulator.createStreamingBuffer();
const chunks = streamSimulator.createStreamingChunks(200, 25);
const notifications = streamSimulator.simulateProgressNotifications('token', chunks);
```

## Integration with Main Test Suite

The LRH tests integrate seamlessly with the main mcpmon test framework:

1. **Automatic Registration** - Tests are auto-discovered via DI decorators
2. **Shared Utilities** - Uses common test infrastructure (TestHarness, MockMCPMon)
3. **Isolation** - Each test runs in isolated container scope
4. **Parallel Execution** - Safe for parallel test execution

## Best Practices

### Test Organization
- **Unit tests** for individual methods and functions
- **Integration tests** for hook interactions and workflows
- **Streaming tests** for complex buffering scenarios
- **Performance tests** for large dataset handling

### Mock Usage
- Use `LRHMockMCPMon` for LRH-specific testing needs
- Use `DuckDBMock` for database simulation
- Use `StreamSimulator` for streaming scenarios
- Create focused mocks for specific test scenarios

### Test Data
- Generate realistic data sizes for performance testing
- Use deterministic data for reproducible tests
- Test edge cases (empty responses, malformed data, etc.)
- Simulate real-world usage patterns

## Future Enhancements

- [ ] Add performance benchmarking tests
- [ ] Expand DuckDB query testing scenarios
- [ ] Add schema generation validation tests
- [ ] Include memory usage monitoring
- [ ] Add cross-platform file system tests
- [ ] Implement fuzz testing for edge cases

## Dependencies

- **Jest** - Test framework
- **Inversify** - Dependency injection
- **@jest/globals** - Jest type definitions
- **Node.js fs/crypto** - File system and UUID utilities

## Troubleshooting

### Common Issues

1. **DI Registration Failures**
   - Ensure `register.ts` is imported before running tests
   - Check that all injectable classes have `@injectable()` decorator

2. **Streaming Test Timeouts**
   - Increase Jest timeout for streaming tests
   - Use shorter intervals in test configurations

3. **File System Tests**
   - Ensure test has write permissions to temp directories
   - Clean up test files in teardown

4. **Mock Setup Issues**
   - Reset mocks between tests using `beforeEach`
   - Verify mock implementations match interface contracts