# Extension Development Guide

This guide provides everything you need to know to develop extensions for mcpmon, from quick start to advanced patterns.

## Quick Start

Get started with extension development in minutes:

### 1. Create Your Extension

```typescript
// my-extension/index.ts
import type { Extension, ExtensionContext } from '../interfaces';

export class MyExtension implements Extension {
  name = 'my-extension';
  version = '1.0.0';
  description = 'Your extension description';
  
  async initialize(context: ExtensionContext): Promise<void> {
    // Register tools and hooks
    context.registerTool(this.createMyTool());
    context.registerHook('beforeStdinForward', this.handleBeforeStdinForward.bind(this));
  }
  
  async cleanup(): Promise<void> {
    // Clean up resources
  }
  
  private createMyTool() {
    return {
      name: 'my_tool',
      description: 'My custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      },
      handler: async (input: any) => {
        return { 
          content: [{ 
            type: 'text', 
            text: `Processed: ${input.message}` 
          }] 
        };
      }
    };
  }
  
  private async handleBeforeStdinForward(message: any): Promise<any> {
    // Process outgoing messages
    console.log('Processing request:', message);
    return message;
  }
}
```

### 2. Register Your Extension

```typescript
// In your mcpmon integration
import { MyExtension } from './my-extension';

const extension = new MyExtension();
await extensionRegistry.register(extension);
```

### 3. Test Your Extension

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development mode
npm run dev
```

## Core Concepts

### Extension Interface

All extensions implement the `Extension` interface:

```typescript
export interface Extension {
  name: string;
  version: string;
  description?: string;
  
  // Lifecycle methods
  initialize?(context: ExtensionContext): Promise<void>;
  cleanup?(): Promise<void>;
}
```

### Hook System

Extensions integrate with mcpmon through hooks at well-defined points:

- **`beforeStdinForward`**: Modify requests before forwarding to server
- **`afterStdoutReceive`**: Transform responses before returning to client
- **`handleToolCall`**: Implement custom tools
- **`getAdditionalTools`**: Dynamically register tools

### Extension Context

The context provides access to core services:

```typescript
export interface ExtensionContext {
  proxy: MCPProxy;
  config: MCPProxyConfig;
  logger: Logger;
  hooks: ExtensionHooks;
  registerTool(tool: Tool): void;
  registerHook(hookName: string, handler: Function): void;
}
```

### Configuration

Extensions can define their own configuration schema:

```typescript
interface MyExtensionConfig {
  maxRequests: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  customOptions: Record<string, any>;
}

export class MyExtension implements Extension {
  private config: MyExtensionConfig = {
    maxRequests: 1000,
    logLevel: 'info',
    customOptions: {}
  };
  
  async initialize(context: ExtensionContext): Promise<void> {
    // Merge with user-provided config
    this.config = { ...this.config, ...context.config.extensions?.['my-extension'] };
  }
}
```

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone mcpmon repository
git clone <mcpmon-repo>
cd mcpmon

# Install dependencies
npm install

# Create your extension directory
mkdir src/extensions/my-extension
cd src/extensions/my-extension
```

### 2. Extension Structure

Organize your extension following the standard structure:

```
src/extensions/my-extension/
├── index.ts              # Main extension implementation
├── config.ts             # Configuration schema
├── README.md             # Extension documentation
└── tests/                # Test files
    ├── unit.test.ts      # Unit tests
    ├── integration.test.ts # Integration tests
    └── providers.ts      # Test utilities
```

### 3. Development Loop

```bash
# Start development with hot-reload
npm run dev

# Run tests in watch mode (separate terminal)
npm run test:watch

# Check formatting and linting
npm run lint
```

### 4. Hook Implementation Patterns

#### Request Processing Hook
```typescript
private async handleBeforeStdinForward(message: any): Promise<any> {
  // Validate message structure
  if (!message || typeof message !== 'object') {
    return message;
  }
  
  // Add metadata
  message.metadata = {
    ...message.metadata,
    processedBy: this.name,
    timestamp: Date.now()
  };
  
  // Apply transformations
  if (message.method === 'tools/call') {
    message = await this.preprocessToolCall(message);
  }
  
  return message;
}
```

#### Response Processing Hook
```typescript
private async handleAfterStdoutReceive(message: any): Promise<any> {
  // Log response metrics
  this.logResponseMetrics(message);
  
  // Transform large responses
  if (this.isLargeResponse(message)) {
    message = await this.handleLargeResponse(message);
  }
  
  return message;
}
```

#### Custom Tool Implementation
```typescript
private createAnalyticsTool() {
  return {
    name: 'get_analytics',
    description: 'Get extension analytics',
    inputSchema: {
      type: 'object',
      properties: {
        timeRange: { type: 'string', enum: ['hour', 'day', 'week'] },
        metrics: { type: 'array', items: { type: 'string' } }
      }
    },
    handler: async (input: any) => {
      const analytics = await this.getAnalytics(input.timeRange, input.metrics);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analytics, null, 2)
        }]
      };
    }
  };
}
```

## Testing Patterns

### Unit Testing with MockMCPMon

```typescript
import { MyExtension } from '../index';
import { MockMCPMon } from '../../testing/MockMCPMon';

describe('MyExtension Unit Tests', () => {
  let extension: MyExtension;
  let mockMCPMon: MockMCPMon;
  
  beforeEach(() => {
    mockMCPMon = new MockMCPMon();
    extension = new MyExtension();
  });
  
  test('should register tools correctly', async () => {
    await extension.initialize(mockMCPMon.getContext());
    
    const tools = mockMCPMon.getRegisteredTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('my_tool');
  });
  
  test('should process messages correctly', async () => {
    await extension.initialize(mockMCPMon.getContext());
    
    const message = { method: 'test', params: {} };
    const result = await mockMCPMon.processBeforeStdinForward(message);
    
    expect(result.metadata).toBeDefined();
    expect(result.metadata.processedBy).toBe('my-extension');
  });
});
```

### Integration Testing with TestHarness

```typescript
import { MCPMonTestHarness } from '../../testing/MCPMonTestHarness';
import { MyExtension } from '../index';

describe('MyExtension Integration Tests', () => {
  let harness: MCPMonTestHarness;
  
  beforeEach(async () => {
    harness = new MCPMonTestHarness();
    await harness.initialize();
    await harness.registerExtension(new MyExtension());
  });
  
  afterEach(async () => {
    await harness.cleanup();
  });
  
  test('should handle complete message flow', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'my_tool', arguments: { message: 'test' } }
    };
    
    const response = await harness.sendRequest(request);
    
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toContain('Processed: test');
  });
});
```

### E2E Testing with Client Simulation

```typescript
import { MCPClientSimulator } from '../../testing/e2e/MCPClientSimulator';

describe('MyExtension E2E Tests', () => {
  let simulator: MCPClientSimulator;
  
  beforeEach(async () => {
    simulator = new MCPClientSimulator();
    await simulator.start();
  });
  
  afterEach(async () => {
    await simulator.stop();
  });
  
  test('should work in real MCP session', async () => {
    // Initialize session
    await simulator.initialize();
    
    // Test tool availability
    const tools = await simulator.listTools();
    expect(tools.tools.some(t => t.name === 'my_tool')).toBe(true);
    
    // Test tool execution
    const result = await simulator.callTool('my_tool', { message: 'hello' });
    expect(result.content[0].text).toContain('Processed: hello');
  });
});
```

### Performance Testing

```typescript
describe('MyExtension Performance Tests', () => {
  test('should handle high message volume', async () => {
    const harness = new MCPMonTestHarness();
    await harness.initialize();
    await harness.registerExtension(new MyExtension());
    
    const startTime = Date.now();
    const promises = [];
    
    // Send 1000 requests
    for (let i = 0; i < 1000; i++) {
      promises.push(harness.sendRequest({
        jsonrpc: '2.0',
        id: i,
        method: 'tools/call',
        params: { name: 'my_tool', arguments: { message: `test${i}` } }
      }));
    }
    
    await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    await harness.cleanup();
  });
});
```

### Configuration Testing

```typescript
describe('MyExtension Configuration Tests', () => {
  test('should apply custom configuration', async () => {
    const config = {
      extensions: {
        'my-extension': {
          maxRequests: 500,
          logLevel: 'debug'
        }
      }
    };
    
    const harness = new MCPMonTestHarness(config);
    await harness.initialize();
    
    const extension = new MyExtension();
    await harness.registerExtension(extension);
    
    // Verify configuration was applied
    expect(extension.getConfig().maxRequests).toBe(500);
    expect(extension.getConfig().logLevel).toBe('debug');
  });
});
```

### Error Handling Tests

```typescript
describe('MyExtension Error Handling', () => {
  test('should handle malformed messages gracefully', async () => {
    const harness = new MCPMonTestHarness();
    await harness.initialize();
    await harness.registerExtension(new MyExtension());
    
    const malformedMessage = { invalid: 'structure' };
    
    // Should not throw error
    const result = await harness.processMessage(malformedMessage);
    expect(result).toBeDefined();
  });
  
  test('should handle tool execution errors', async () => {
    const harness = new MCPMonTestHarness();
    await harness.initialize();
    await harness.registerExtension(new MyExtension());
    
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'my_tool', arguments: { invalid: 'params' } }
    };
    
    const response = await harness.sendRequest(request);
    
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602); // Invalid params
  });
});
```

This comprehensive guide provides everything needed to develop, test, and deploy extensions for mcpmon. Follow these patterns and practices to build robust, maintainable extensions that integrate seamlessly with the mcpmon ecosystem.