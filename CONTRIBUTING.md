# Contributing to mcpmon

👍🎉 First off, thanks for taking the time to contribute! 🎉👍

We welcome contributions from everyone, regardless of experience level. This guide helps you get started with mcpmon development.

## Ways to Contribute

### 🐛 Found a Bug?

- Check if it's already reported in [Issues](https://github.com/neilopet/mcpmon/issues)
- If not, [create a new issue](https://github.com/neilopet/mcpmon/issues/new) with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Your environment (OS, Node.js version)
  - MCP server configuration (if applicable)

### 💡 Have an Idea?

- Check existing issues for similar requests
- Open a feature request with:
  - Clear description of the problem it solves
  - Proposed solution
  - Use cases and examples

### 📝 Documentation Improvements

- Fix typos, improve clarity, add examples
- Documentation lives in `/docs` (specialized guides) and README.md (quick start)
- All contributions to docs are welcome!

## Development Setup

### Prerequisites

- Node.js 18+ ([install guide](https://nodejs.org/))
- npm (comes with Node.js)
- Git
- A test MCP server for development (we provide examples)

### Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/mcpmon.git
cd mcpmon

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Run tests to verify setup (includes clean and build)
npm test

# 5. Start development
npm run dev
```

### Project Structure

```
src/
├── cli.ts             # Main CLI entry point
├── proxy.ts           # MCPProxy core implementation
├── config_launcher.ts # Config-based launcher
├── interfaces.ts      # Platform-agnostic interfaces
├── node/              # Node.js-specific implementations
│   ├── NodeProcessManager.ts
│   └── NodeFileSystem.ts
└── index.ts           # Module exports

dist/                  # Compiled JavaScript output

tests/
├── behavior/          # Platform-agnostic behavioral tests
│   ├── test_helper.ts # Shared test utilities
│   └── *.test.ts      # Behavioral test files
├── integration/       # Integration tests
│   ├── cli.test.ts
│   └── node_implementations.test.ts
├── mocks/             # Mock implementations
│   ├── MockProcessManager.ts
│   └── MockFileSystem.ts
└── fixtures/          # Test MCP servers

examples/              # Usage examples
docs/                  # Documentation
```

## Development Workflow

### Extension Development Setup

mcpmon features a robust extension system for enhancing functionality through isolated, pluggable components. Extensions can intercept messages, provide additional tools, and implement custom workflows without modifying core code.

#### Prerequisites

Before developing extensions, ensure you have:

- Node.js 18+ with npm
- TypeScript knowledge
- Understanding of MCP protocol basics
- Familiarity with JSON-RPC message structure

#### Initial Setup

1. **Clone and Setup**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcpmon.git
   cd mcpmon
   npm install
   npm run build
   ```

2. **Create Extension Branch**:
   ```bash
   git checkout -b feature/extension-your-extension-name
   ```

3. **Extension Development Structure**:
   ```
   src/extensions/
   ├── your-extension-name/
   │   ├── index.ts           # Main extension implementation
   │   ├── index.test.ts      # Unit tests
   │   └── README.md          # Extension documentation
   ├── interfaces.ts          # Extension interfaces
   └── registry.ts            # Extension registry
   ```

### Development Loop with Extensions

#### 1. Extension Scaffold Creation

```bash
# Create extension directory
mkdir src/extensions/your-extension-name

# Create core files
touch src/extensions/your-extension-name/index.ts
touch src/extensions/your-extension-name/index.test.ts
touch src/extensions/your-extension-name/README.md
```

#### 2. Extension Implementation

Implement the extension following the hook pattern:

```typescript
import type { Extension, ExtensionContext, MessageHook } from '../interfaces.js';

export class YourExtension implements Extension {
  readonly id = 'your-extension-name';
  readonly name = 'Your Extension Name';
  readonly version = '1.0.0';
  readonly defaultEnabled = false;
  
  private context?: ExtensionContext;
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    
    // Register hooks during initialization
    context.hooks.beforeStdinForward = this.interceptRequest.bind(this);
    context.hooks.afterStdoutReceive = this.interceptResponse.bind(this);
    context.hooks.getAdditionalTools = this.provideTools.bind(this);
    context.hooks.handleToolCall = this.handleTool.bind(this);
  }
  
  async shutdown(): Promise<void> {
    this.context = undefined;
  }
  
  private async interceptRequest(message: any): Promise<any> {
    this.context?.logger.debug(`Processing request: ${message.method}`);
    return message; // Always return the message
  }
  
  private async provideTools(): Promise<ToolDefinition[]> {
    return [
      {
        name: 'your-tool-name',
        description: 'Description of what your tool does',
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter description'
            }
          },
          required: ['input']
        }
      }
    ];
  }
}
```

## Code Standards for Extensions

This section defines coding standards, best practices, and quality requirements for mcpmon extension development. All extensions must follow these standards to ensure consistency, maintainability, and reliability.

### Extension Coding Standards

#### 1. Project Structure Standards

Extensions must follow the standardized directory structure:

```
src/extensions/
├── extension-name/           # Use kebab-case naming
│   ├── index.ts             # Main extension implementation
│   ├── index.test.ts        # Comprehensive unit tests
│   ├── README.md            # Extension documentation
│   └── config.schema.json   # Configuration schema (if needed)
├── interfaces.ts            # Shared extension interfaces
└── registry.ts              # Extension registry
```

#### 2. Naming Conventions

- **Extension IDs**: Use kebab-case (e.g., `large-response-handler`, `data-transformer`)
- **Class Names**: Use PascalCase (e.g., `LargeResponseHandler`, `DataTransformer`)
- **Method Names**: Use camelCase (e.g., `handleMessage`, `processResponse`)
- **File Names**: Use kebab-case for directories, camelCase for TypeScript files
- **Tool Names**: Use kebab-case (e.g., `format-response`, `analyze-data`)

#### 3. Interface Implementation Requirements

All extensions must implement the core `Extension` interface:

```typescript
export class YourExtension implements Extension {
  readonly id = 'your-extension-name';        // kebab-case, unique identifier
  readonly name = 'Your Extension Name';      // Human-readable display name
  readonly version = '1.0.0';                 // Semantic versioning
  readonly defaultEnabled = false;            // Conservative default
  
  private context?: ExtensionContext;         // Store context privately
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    // Register hooks during initialization only
  }
  
  async shutdown(): Promise<void> {
    // Clean up resources, clear context
    this.context = undefined;
  }
}
```

#### 4. TypeScript Standards

- **Strict Mode**: Enable all TypeScript strict checks
- **Type Safety**: Use explicit types, avoid `any` except for message objects
- **Interface Contracts**: Implement all interface methods completely
- **Error Handling**: Use try-catch blocks in all hook implementations
- **Async/Await**: Prefer async/await over Promise chains
- **Import/Export**: Use ES modules with `.js` extensions for compiled output

### Hook Implementation Best Practices

#### 1. Message Hook Guidelines

Message hooks (`beforeStdinForward`, `afterStdoutReceive`) must follow these patterns:

```typescript
// CORRECT: Always return the message
private async interceptRequest(message: any): Promise<any> {
  try {
    this.context?.logger.debug(`Processing ${message.method}`);
    
    // Perform processing
    const processedMessage = this.processMessage(message);
    
    // Always return a message object
    return processedMessage;
  } catch (error) {
    this.context?.logger.error(`Hook error: ${error.message}`);
    return message; // Return original on error
  }
}

// INCORRECT: Don't modify message structure unexpectedly
private async badHook(message: any): Promise<any> {
  delete message.id; // Breaking change
  return null; // Never return null
}
```

#### 2. Tool Hook Guidelines

Tool hooks (`getAdditionalTools`, `handleToolCall`) must provide complete implementations:

```typescript
private async provideTools(): Promise<ToolDefinition[]> {
  return [
    {
      name: 'tool-name',                    // kebab-case
      description: 'Clear, specific description of tool functionality',
      inputSchema: {
        type: 'object',
        properties: {
          requiredParam: {
            type: 'string',
            description: 'Clear parameter description'
          }
        },
        required: ['requiredParam'],       // Always specify required fields
        additionalProperties: false       // Strict schema validation
      }
    }
  ];
}

private async handleTool(name: string, args: any): Promise<any> {
  if (name !== 'tool-name') {
    throw new Error(`Unknown tool: ${name}`);
  }
  
  // Validate arguments against schema
  this.validateToolArgs(args);
  
  try {
    const result = await this.executeTool(args);
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  } catch (error) {
    this.context?.logger.error(`Tool execution failed: ${error.message}`);
    throw error; // Re-throw for proper error handling
  }
}
```

#### 3. Hook Registration Standards

- **Timing**: Register all hooks during `initialize()` method only
- **Binding**: Always bind hook methods to maintain `this` context
- **Selective Registration**: Only register hooks that the extension actually uses
- **Error Isolation**: Wrap hook logic in try-catch blocks to prevent proxy crashes

#### 4. State Management Guidelines

- **Private State**: Store all extension state as private class properties
- **Context Storage**: Use `context.dataDir` for persistent data
- **Session Isolation**: Avoid global variables or shared state between sessions
- **Resource Cleanup**: Clear all state during `shutdown()` method

### Testing Standards for Extensions

#### 1. Test Coverage Requirements

- **Minimum Coverage**: 90% line coverage for all extension code
- **Branch Coverage**: 85% branch coverage for conditional logic
- **Hook Coverage**: 100% coverage for all registered hooks
- **Error Coverage**: Test all error handling paths

#### 2. Test File Organization

```typescript
// extension-name/index.test.ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { YourExtension } from './index.js';
import type { ExtensionContext } from '../interfaces.js';

describe('YourExtension', () => {
  let extension: YourExtension;
  let mockContext: ExtensionContext;
  
  beforeEach(() => {
    extension = new YourExtension();
    mockContext = createMockContext(); // Use helper function
  });
  
  afterEach(async () => {
    await extension.shutdown();
    jest.clearAllMocks();
  });
  
  describe('Core Interface', () => {
    // Test interface implementation
  });
  
  describe('Hook Registration', () => {
    // Test hook registration and behavior
  });
  
  describe('Tool Functionality', () => {
    // Test tool definitions and handling
  });
  
  describe('Error Handling', () => {
    // Test error scenarios
  });
});
```

#### 3. Mock Standards

- **Dependency Injection**: Use Jest mocks for all external dependencies
- **Context Mocking**: Provide complete mock ExtensionContext objects
- **Logger Mocking**: Mock all logger methods to verify debug output
- **Hook Mocking**: Test hook registration and execution independently

#### 4. Test Implementation Patterns

```typescript
// Test hook registration
it('should register hooks during initialization', async () => {
  await extension.initialize(mockContext);
  
  expect(mockContext.hooks.beforeStdinForward).toBeDefined();
  expect(mockContext.hooks.getAdditionalTools).toBeDefined();
});

// Test hook behavior
it('should process messages correctly', async () => {
  await extension.initialize(mockContext);
  
  const inputMessage = { method: 'test', params: {} };
  const result = await mockContext.hooks.beforeStdinForward!(inputMessage);
  
  expect(result).toEqual(expect.objectContaining({
    method: 'test',
    params: expect.any(Object)
  }));
});

// Test error handling
it('should handle hook errors gracefully', async () => {
  await extension.initialize(mockContext);
  
  const invalidMessage = null;
  const result = await mockContext.hooks.beforeStdinForward!(invalidMessage);
  
  expect(mockContext.logger.error).toHaveBeenCalled();
  expect(result).toBe(invalidMessage); // Should return original
});
```

### Code Review Criteria for Extensions

#### 1. Architecture Review

- **Interface Compliance**: Extension implements all required interface methods
- **Hook Usage**: Hooks are used appropriately for their intended purpose
- **Separation of Concerns**: Extension logic is well-separated and focused
- **Resource Management**: Proper initialization and cleanup procedures

#### 2. Code Quality Review

- **TypeScript Compliance**: Code compiles without errors or warnings
- **Naming Consistency**: All names follow kebab-case/camelCase conventions
- **Error Handling**: Comprehensive error handling with proper logging
- **Performance Impact**: Extension doesn't negatively impact proxy performance

#### 3. Testing Review

- **Test Coverage**: Meets minimum coverage requirements (90% line, 85% branch)
- **Test Quality**: Tests are meaningful and cover edge cases
- **Mock Usage**: Appropriate use of mocks and dependency injection
- **Test Documentation**: Clear test descriptions and setup

#### 4. Documentation Review

- **Extension README**: Complete documentation with usage examples
- **Code Comments**: Complex logic is well-commented
- **Configuration Schema**: JSON schema for configuration options (if applicable)
- **Hook Documentation**: Clear explanation of hook behavior and side effects

#### 5. Integration Review

- **Extension Registry**: Extension properly registered in `registry.ts`
- **Configuration Integration**: Extension configuration integrates with main config
- **Tool Integration**: Extension tools work correctly with MCP protocol
- **Backward Compatibility**: Extension doesn't break existing functionality

#### 6. Security Review

- **Input Validation**: All external inputs are validated
- **File System Access**: Appropriate use of `context.dataDir` for data storage
- **Error Information**: Error messages don't leak sensitive information
- **Resource Limits**: Extension respects system resource constraints

### Development Loop Process

```bash
# 1. Implement extension logic
npm run build

# 2. Run tests in watch mode
npm run test:watch

# 3. Test with real MCP server
npm start

# 4. Run full test suite
npm test

# 5. Check code quality
npm run lint && npm run format

# 6. Verify coverage
npm run test:coverage
```

### Testing Workflow for Extensions

#### Test Structure Requirements

Extensions must include comprehensive tests following mcpmon's dependency injection patterns:

1. **Unit Tests**: Test extension logic in isolation using mocks
2. **Integration Tests**: Test extension interaction with proxy components  
3. **Hook Tests**: Verify hook registration and execution
4. **Tool Tests**: Test tool definitions and handling

#### Test Implementation Pattern

```typescript
// your-extension-name/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { YourExtension } from './index.js';
import type { ExtensionContext } from '../interfaces.js';

describe('YourExtension', () => {
  let extension: YourExtension;
  let mockContext: ExtensionContext;
  
  beforeEach(() => {
    extension = new YourExtension();
    
    mockContext = {
      dependencies: {} as any,
      config: {},
      hooks: {},
      dataDir: '/tmp/test-data',
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      sessionId: 'test-session'
    };
  });
  
  afterEach(async () => {
    await extension.shutdown();
  });
  
  it('should initialize with correct configuration', async () => {
    await extension.initialize(mockContext);
    
    expect(extension.id).toBe('your-extension-name');
    expect(extension.name).toBe('Your Extension Name');
    expect(extension.defaultEnabled).toBe(false);
  });
  
  it('should register hooks during initialization', async () => {
    await extension.initialize(mockContext);
    
    expect(mockContext.hooks.beforeStdinForward).toBeDefined();
    expect(mockContext.hooks.getAdditionalTools).toBeDefined();
  });
  
  it('should provide expected tools', async () => {
    await extension.initialize(mockContext);
    
    const tools = await mockContext.hooks.getAdditionalTools!();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('your-tool-name');
  });
});
```

#### Testing Commands

```bash
# Run all tests (includes clean and build)
npm test

# Run tests in watch mode for development
npm run test:watch

# Run extension-specific tests
npm test -- src/extensions/your-extension-name

# Run with coverage
npm run test:coverage
```

#### Testing Standards

- **Test File Naming**: Use `{extension-name}.test.ts` format
- **Mock Dependencies**: Use Jest mocks for all external dependencies
- **Test Hook Behavior**: Verify hooks are registered and function correctly
- **Test Error Handling**: Include tests for error conditions
- **Coverage Requirements**: Maintain >90% test coverage for extension code

### Contribution Process for Extensions

#### 1. Planning and Design

1. **Identify Use Case**: Clearly define what problem the extension solves
2. **Review Existing Extensions**: Check if similar functionality exists
3. **Design Extension Interface**: Plan hook usage and tool definitions
4. **Create Proposal**: Open an issue describing the extension concept

#### 2. Implementation Phase

1. **Follow Hook Guidelines**:
   - Always return messages from message hooks
   - Handle errors gracefully with try-catch blocks
   - Use kebab-case naming for extension IDs and tools
   - Log hook activity using `context.logger`
   - Maintain state carefully as private properties

2. **Code Quality Standards**:
   ```bash
   # Format code
   npm run format
   
   # Check linting
   npm run lint
   
   # Build and verify compilation
   npm run build
   ```

3. **Registry Update** (if needed):
   ```typescript
   // src/extensions/registry.ts - add to builtins array
   const builtins: string[] = [
     'large-response-handler',
     'your-extension-name', // Add your extension
   ];
   ```

#### 3. Documentation Requirements

Create comprehensive documentation:

1. **Extension README**: Create `src/extensions/your-extension-name/README.md`
2. **Configuration Schema**: Document all config options
3. **Hook Documentation**: Explain hook behavior and side effects
4. **Tool Documentation**: Document provided tools and usage examples

#### 4. Quality Assurance

Before submission, verify:

- [ ] Extension follows interface contracts exactly
- [ ] All hooks return appropriate values
- [ ] Configuration schema is well-defined
- [ ] Tests achieve >90% coverage
- [ ] Documentation is complete
- [ ] Naming uses kebab-case consistently
- [ ] Error handling is comprehensive
- [ ] Resource cleanup is implemented

#### 5. Submission Guidelines

1. **Pull Request Format**:
   - Title: `feat: add {extension-name} extension`
   - Description must include:
     - Extension purpose and functionality
     - Hook usage and behavior
     - Tool definitions and examples
     - Configuration options
     - Testing instructions

2. **Review Process**:
   - Maintainer review for architecture compliance
   - Test coverage verification
   - Documentation completeness check
   - Integration testing with existing extensions

### Commit Guidelines

Follow [Conventional Commits](https://conventionalcommits.org/) for extension development:

```bash
# Extension-specific examples
git commit -m "feat: add your-extension-name extension"
git commit -m "fix: resolve hook registration in your-extension-name"
git commit -m "test: add integration tests for your-extension-name"
git commit -m "docs: update your-extension-name README"
```

**Commit Types for Extensions:**

- `feat`: New extension or extension feature
- `fix`: Extension bug fix
- `docs`: Extension documentation changes
- `test`: Extension test additions or modifications
- `refactor`: Extension code refactoring
- `style`: Extension formatting changes


## Development Tips

### Testing with Real MCP Servers

1. Use the test fixtures in `tests/fixtures/`
2. Create a `.env` file for local testing:
   ```bash
   MCP_SERVER_COMMAND=node
   MCP_SERVER_ARGS=tests/fixtures/mcp_server_v1.js
   MCP_WATCH_FILE=tests/fixtures/mcp_server_v1.js
   ```
3. Run: `npm start` to test manually

### Debugging

- Use `console.error()` for debug output (goes to stderr)
- Enable verbose logging in tests
- Check the `proxy.log` file for detailed output

### Performance Considerations

- Hot-reload should be fast (< 2 seconds)
- Minimize memory usage during restarts
- Test with large MCP servers

## Pull Request Process

### 1. Before Submitting

- [ ] Tests pass (`npm test` - this will clean and build first)
- [ ] Code is formatted (`npm run format`)
- [ ] Code compiles (`npm run build`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated (if applicable)

### 2. Pull Request Description

Include:

- What changes you made and why
- How to test the changes
- Screenshots/examples for UI changes
- Breaking changes (if any)

### 3. Review Process

- Maintainers will review within 2-3 business days
- Address feedback promptly
- Keep the PR focused and atomic
- Rebase on main if needed

## Release Process

Releases follow semantic versioning:

- `patch`: Bug fixes (0.1.0 → 0.1.1)
- `minor`: New features (0.1.0 → 0.2.0)
- `major`: Breaking changes (0.1.0 → 1.0.0)

## Code of Conduct

This project follows standard open source conduct guidelines. Please be respectful, professional, and constructive in all interactions.

## Getting Help

Need help? Here's how to get support:

1. **Check Documentation**: Start with [README.md](README.md) for quick start, then see specialized guides:
   - [CLI Reference](docs/cli.md) - Command-line options and environment variables
   - [Configuration Guide](docs/configuration.md) - Advanced configuration and file-based setup
   - [Examples](docs/examples.md) - Practical usage patterns and integration examples  
   - [Docker Guide](docs/docker.md) - Container management and troubleshooting
   - [Extension Development](docs/extension-development.md) - Building custom extensions
2. **Search Issues**: Someone might have asked the same question
3. **Create an Issue**: For bugs, feature requests, or questions
4. **Discussions**: For general questions about MCP or hot-reload concepts

## Recognition

Contributors are recognized in:

- Release notes
- README.md contributors section
- Git history

Thank you for contributing to mcpmon! 🚀
