# Contributing to RequestLoggerExtension

Thank you for your interest in contributing to the RequestLoggerExtension! This document provides guidelines for contributing to this example extension.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd example-extension
   ```

2. **Install Deno** (if not already installed)
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

3. **Cache dependencies**
   ```bash
   deno cache src/index.ts
   ```

4. **Run tests to verify setup**
   ```bash
   deno task test
   ```

## Development Workflow

### 1. Development Loop

```bash
# Start development with hot reload
deno task dev

# Run tests in watch mode (in another terminal)
deno task test:watch

# Check code formatting
deno fmt

# Check linting
deno lint
```

### 2. Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Run the full test suite**
   ```bash
   deno task test
   ```

4. **Format and lint your code**
   ```bash
   deno fmt
   deno lint
   ```

### 3. Testing Guidelines

This extension demonstrates comprehensive testing patterns. When contributing:

#### Unit Tests (`tests/unit.test.ts`)
- Test individual components in isolation
- Use MockMCPMon for testing extension logic
- Test configuration validation
- Test error handling

```typescript
Deno.test('Unit Test Example', async () => {
  const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
  const extension = new RequestLoggerExtension();
  
  await extension.initialize(mockMCPMon.getContext());
  
  // Test your functionality
  assertEquals(expected, actual);
});
```

#### Integration Tests (`tests/integration.test.ts`)
- Test extension integration with MCP framework
- Use TestHarness for real MCP simulation
- Test message flow and tool functionality

```typescript
Deno.test('Integration Test Example', async () => {
  const harness = await RequestLoggerTestProviders.createTestHarness();
  
  try {
    // Test integration scenario
    await harness.sendMessage(request);
    const result = await harness.callTool('tool_name', params);
    
    assertEquals(expected, result);
  } finally {
    await harness.cleanup();
  }
});
```

#### E2E Tests (`tests/e2e.test.ts`)
- Test complete workflows
- Test performance and stress scenarios
- Test different configurations

```typescript
Deno.test('E2E Test Example', async () => {
  const harness = await RequestLoggerTestProviders.createTestHarness(config);
  
  try {
    // Simulate complete workflow
    await simulateCompleteWorkflow(harness);
    
    // Verify results
    const stats = await harness.callTool('get_request_stats', {});
    assertEquals(expected, stats);
  } finally {
    await harness.cleanup();
  }
});
```

### 4. Code Style Guidelines

- **Use TypeScript**: All code should be properly typed
- **Follow Deno conventions**: Use Deno-style imports and modules
- **Document public APIs**: Add JSDoc comments for public methods
- **Handle errors gracefully**: Always include proper error handling
- **Use descriptive names**: Variables and functions should be self-documenting

### 5. Documentation

When adding new features:

1. **Update README.md**: Add documentation for new configuration options or tools
2. **Add JSDoc comments**: Document public APIs and complex logic
3. **Update examples**: Include usage examples for new features
4. **Test documentation**: Ensure examples work correctly

## Contribution Types

### Bug Fixes
- Include a clear description of the bug
- Add a test case that reproduces the issue
- Ensure the fix doesn't break existing functionality

### New Features
- Discuss major features in an issue first
- Add comprehensive tests for new functionality
- Update documentation and examples
- Consider backward compatibility

### Performance Improvements
- Include benchmarks showing the improvement
- Ensure improvements don't break existing functionality
- Add performance tests if applicable

### Documentation Updates
- Fix typos and improve clarity
- Add missing documentation
- Update outdated examples

## Testing Your Changes

### Pre-commit Checklist

Before committing, ensure:

```bash
# All tests pass
deno task test

# Code is formatted
deno fmt

# Code passes linting
deno lint

# TypeScript compiles correctly
deno check src/index.ts

# Build succeeds
deno task build
```

### Test Coverage

Aim for comprehensive test coverage:

- **Unit tests**: Test individual components
- **Integration tests**: Test MCP framework integration
- **E2E tests**: Test complete workflows
- **Error scenarios**: Test error handling
- **Configuration tests**: Test all configuration options

## Submitting Changes

1. **Create a pull request**
   - Use a clear title and description
   - Reference any related issues
   - Include test results

2. **Pull request description should include**:
   - Summary of changes
   - Testing performed
   - Breaking changes (if any)
   - Documentation updates

3. **Be responsive to feedback**
   - Address review comments promptly
   - Be open to suggestions and improvements

## Code Review Process

1. **Automated checks**: CI will run tests and linting
2. **Manual review**: Maintainers will review code quality and design
3. **Testing**: Reviewers may test changes manually
4. **Approval**: Changes need approval before merging

## Extension Patterns

When contributing, follow these MCP extension patterns:

### 1. Extension Structure
```typescript
export class YourExtension implements Extension {
  name = 'your-extension';
  version = '1.0.0';
  description = 'Description of your extension';
  
  async initialize(context: ExtensionContext): Promise<void> {
    // Register tools and hooks
  }
  
  async cleanup(): Promise<void> {
    // Clean up resources
  }
}
```

### 2. Hook Implementation
```typescript
private async handleBeforeStdinForward(message: MCPMessage): Promise<MCPMessage> {
  // Process outgoing messages
  return message;
}

private async handleAfterStdoutReceive(message: MCPMessage): Promise<MCPMessage> {
  // Process incoming messages
  return message;
}
```

### 3. Tool Registration
```typescript
private createYourTool(): Tool {
  return {
    name: 'your_tool',
    description: 'Description of your tool',
    inputSchema: {
      type: 'object',
      properties: {
        // Define parameters
      }
    },
    handler: async (input: ToolInput): Promise<ToolOutput> => {
      // Implement tool logic
      return { content: [{ type: 'text', text: 'result' }] };
    }
  };
}
```

## Getting Help

If you need help:

1. **Check existing tests**: Look at test files for examples
2. **Review documentation**: Check README and code comments
3. **Ask questions**: Open an issue for discussion
4. **Check MCP documentation**: Refer to official MCP specifications

## Recognition

Contributors will be recognized in:
- README contributors section
- Release notes for their contributions
- GitHub contributor graphs

Thank you for contributing to this example extension!