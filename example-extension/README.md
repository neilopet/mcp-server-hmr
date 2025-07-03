# RequestLoggerExtension

A comprehensive MCP (Model Context Protocol) extension that logs all requests and responses with detailed analytics and filtering capabilities. This extension serves as a reference implementation for building third-party MCP extensions with comprehensive testing.

## Features

- **Complete Request/Response Logging**: Captures all MCP messages flowing through the system
- **Configurable Filtering**: Exclude specific methods or patterns from logging
- **Performance Analytics**: Track response times, error rates, and method usage statistics
- **Memory Management**: Configurable limits to prevent memory bloat
- **File Logging**: Optional file output for persistent logs
- **Rich Tool Interface**: Query, filter, and analyze logs via MCP tools
- **Comprehensive Testing**: Full unit, integration, and E2E test coverage

## Installation

1. Clone or download this example extension
2. Install dependencies:
   ```bash
   deno cache src/index.ts
   ```
3. Build the extension:
   ```bash
   deno task build
   ```

## Usage

### Basic Usage

```typescript
import { RequestLoggerExtension } from './src/index.ts';

// Create with default configuration
const extension = new RequestLoggerExtension();

// Create with custom configuration
const extension = new RequestLoggerExtension({
  maxRequests: 500,
  logLevel: 'debug',
  excludePatterns: ['ping', 'heartbeat'],
  logFilePath: '/var/log/mcp-requests.log'
});
```

### Configuration

The extension supports comprehensive configuration:

```typescript
interface RequestLoggerConfig {
  maxRequests: number;           // Maximum requests to keep in memory (default: 1000)
  logRequestBodies: boolean;     // Log request parameters (default: true)
  logResponseBodies: boolean;    // Log response data (default: true)
  logLevel: 'debug' | 'info' | 'warn' | 'error'; // Log level (default: 'info')
  logFilePath?: string;          // Optional file path for persistent logs
  excludePatterns: string[];     // Regex patterns to exclude from logging
  includeTimestamps: boolean;    // Include timestamps in logs (default: true)
  prettyPrint: boolean;          // Pretty-print JSON in logs (default: true)
}
```

### Available Tools

The extension provides three MCP tools:

#### `get_request_logs`
Retrieve logged requests and responses with filtering:

```json
{
  "name": "get_request_logs",
  "arguments": {
    "limit": 50,
    "direction": "both",  // "request", "response", or "both"
    "method": "tools/list" // Filter by specific method
  }
}
```

#### `get_request_stats`
Get analytics about logged requests:

```json
{
  "name": "get_request_stats",
  "arguments": {}
}
```

Returns:
```json
{
  "totalRequests": 150,
  "totalResponses": 148,
  "averageResponseTime": 45,
  "errorCount": 2,
  "methodCounts": {
    "tools/list": 50,
    "tools/call": 98,
    "resources/list": 2
  }
}
```

#### `clear_request_logs`
Clear all logged requests:

```json
{
  "name": "clear_request_logs",
  "arguments": {
    "confirm": true
  }
}
```

## Testing

This extension demonstrates comprehensive testing patterns for MCP extensions:

### Test Structure

```
tests/
├── index.ts              # Main test suite entry point
├── providers.ts          # Test utilities and providers
├── unit.test.ts          # Unit tests with MockMCPMon
├── integration.test.ts   # Integration tests with TestHarness
└── e2e.test.ts           # End-to-end tests with client simulation
```

### Running Tests

```bash
# Run all tests
deno task test

# Run specific test suites
deno task test:unit
deno task test:integration
deno task test:e2e

# Run tests in watch mode
deno task test:watch
```

### Test Patterns Demonstrated

#### Unit Testing with MockMCPMon
```typescript
const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
const extension = new RequestLoggerExtension();

await extension.initialize(mockMCPMon.getContext());

// Test tool registration
const tools = mockMCPMon.getRegisteredTools();
assertEquals(tools.length, 3);

// Test message processing
await mockMCPMon.processBeforeStdinForward(message);
```

#### Integration Testing with TestHarness
```typescript
const harness = await RequestLoggerTestProviders.createTestHarness();

// Test real message flow
await harness.sendMessage(request);
await harness.receiveMessage(response);

// Test tool functionality
const result = await harness.callTool('get_request_logs', {});
```

#### E2E Testing with Client Simulation
```typescript
// Simulate complete MCP session
await simulateCompleteSession(harness);

// Test high-load scenarios
await simulateHighLoad(harness);

// Test configuration variants
for (const config of configs) {
  const harness = await createTestHarness(config);
  await testConfiguration(harness);
}
```

## Development Workflow

### 1. Development Setup
```bash
# Install dependencies
deno cache src/index.ts

# Start development with hot reload
deno task dev
```

### 2. Testing During Development
```bash
# Run tests in watch mode
deno task test:watch

# Run specific test types
deno test tests/unit.test.ts --watch
```

### 3. Pre-commit Validation
```bash
# Run all tests
deno task test

# Build extension
deno task build

# Check formatting
deno fmt --check

# Check linting
deno lint
```

## Architecture

### Extension Structure
- **Main Extension Class**: `RequestLoggerExtension` - Implements the core extension interface
- **Logger**: `RequestLogger` - Handles message logging and analytics
- **Configuration**: `config.ts` - Configuration schema and validation
- **Tools**: Integrated in main class - MCP tools for log access and management

### Hook Implementation
- **beforeStdinForward**: Captures outgoing requests
- **afterStdoutReceive**: Captures incoming responses
- **Tool Registration**: Provides tools for log access and management

### Testing Framework Integration
- **MockMCPMon**: For isolated unit testing
- **TestHarness**: For integration testing with real MCP simulation
- **E2E Simulation**: For complete workflow testing

## Best Practices Demonstrated

1. **Comprehensive Configuration**: Flexible configuration with validation
2. **Memory Management**: Configurable limits and cleanup
3. **Error Handling**: Graceful handling of malformed messages
4. **Performance Monitoring**: Built-in performance tracking
5. **Test Coverage**: Complete test coverage across all scenarios
6. **Documentation**: Comprehensive documentation and examples

## Extension Patterns

This extension demonstrates key patterns for MCP extensions:

1. **Hook Usage**: Proper implementation of beforeStdinForward/afterStdoutReceive
2. **Tool Injection**: Adding custom tools to the MCP server
3. **Configuration Management**: Schema validation and defaults
4. **State Management**: Maintaining extension state across messages
5. **Resource Management**: Proper cleanup and memory management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - See LICENSE file for details.

## Support

For questions or issues:
1. Check the test files for usage examples
2. Review the configuration options
3. Open an issue with detailed error information

This extension serves as a comprehensive reference for building production-ready MCP extensions with proper testing and documentation.