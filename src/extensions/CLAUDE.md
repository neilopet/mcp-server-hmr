# Extension Architecture for mcpmon

> **⚠️ WORK IN PROGRESS**: This extension architecture is currently under development and has not yet been integrated with the main proxy. The design and implementation details described here are subject to change.

## Overview

The mcpmon extension architecture provides a modular, plugin-based system for extending the functionality of the MCP hot-reload proxy. Extensions can hook into various stages of the request/response lifecycle, modify behavior, and add new capabilities without modifying the core proxy code.

## Architecture Design

### Core Components

#### 1. Extension Interface (`interfaces.ts`)

```typescript
export interface Extension {
  name: string;
  version: string;
  description?: string;
  
  // Lifecycle methods
  initialize?(config: ExtensionConfig): Promise<void>;
  shutdown?(): Promise<void>;
  
  // Hook implementations
  hooks?: {
    beforeRequest?: RequestHook;
    afterResponse?: ResponseHook;
    onError?: ErrorHook;
    onServerRestart?: ServerRestartHook;
    beforeServerStart?: ServerStartHook;
    afterServerStop?: ServerStopHook;
  };
}
```

#### 2. Extension Registry (`registry.ts`)

The registry manages the lifecycle of all loaded extensions:

```typescript
export class ExtensionRegistry {
  private extensions: Map<string, Extension> = new Map();
  
  async register(extension: Extension): Promise<void>;
  async unregister(name: string): Promise<void>;
  async executeHook(hookName: string, context: HookContext): Promise<void>;
  getExtension(name: string): Extension | undefined;
  getAllExtensions(): Extension[];
}
```

#### 3. Hook System

Hooks provide well-defined integration points for extensions:

```typescript
export interface HookContext {
  request?: any;
  response?: any;
  error?: Error;
  server?: MCPServer;
  metadata?: Record<string, any>;
}

export type HookResult = {
  modified?: boolean;
  continue?: boolean;
  data?: any;
};
```

### Dependency Injection

Extensions integrate with the core proxy through dependency injection, allowing them to:

1. **Access Core Services**: Extensions receive instances of core services during initialization
2. **Modify Request/Response Flow**: Through hooks, extensions can intercept and modify data
3. **Add Middleware**: Extensions can register middleware functions with the proxy
4. **Provide New Capabilities**: Extensions can expose new APIs or functionality

Example integration:

```typescript
// In the proxy
class MCPProxy {
  constructor(
    private extensionRegistry: ExtensionRegistry,
    // ... other dependencies
  ) {}
  
  async handleRequest(request: any) {
    // Execute pre-request hooks
    await this.extensionRegistry.executeHook('beforeRequest', { request });
    
    // Process request...
    
    // Execute post-response hooks
    await this.extensionRegistry.executeHook('afterResponse', { response });
  }
}
```

## Available Hooks

### Request/Response Hooks

- **`beforeRequest`**: Called before a request is forwarded to the MCP server
  - Can modify request data
  - Can short-circuit the request
  - Use cases: authentication, rate limiting, request logging

- **`afterResponse`**: Called after receiving a response from the MCP server
  - Can modify response data
  - Can add metadata
  - Use cases: response caching, data transformation, metrics collection

### Error Handling Hooks

- **`onError`**: Called when an error occurs during request processing
  - Can handle or transform errors
  - Can provide fallback responses
  - Use cases: error reporting, graceful degradation

### Server Lifecycle Hooks

- **`onServerRestart`**: Called when the MCP server is restarted
  - Can perform cleanup or re-initialization
  - Use cases: cache invalidation, connection reset

- **`beforeServerStart`**: Called before starting an MCP server
  - Can modify server configuration
  - Use cases: environment setup, configuration validation

- **`afterServerStop`**: Called after an MCP server stops
  - Can perform cleanup
  - Use cases: resource cleanup, state persistence

## Directory Structure

```
src/extensions/
├── CLAUDE.md                    # This documentation
├── interfaces.ts                # Core extension interfaces
├── registry.ts                  # Extension registry implementation
├── large-response-handler/      # Example extension
│   ├── README.md
│   ├── handler.ts
│   └── index.ts
├── metrics/                     # Metrics collection extension
│   └── index.ts
└── [new-extension]/            # Your new extension
    ├── index.ts                # Extension entry point
    ├── README.md               # Extension documentation
    └── [other-files]           # Implementation files
```

## Creating New Extensions

### Basic Extension Template

```typescript
// my-extension/index.ts
import type { Extension, ExtensionConfig } from '../interfaces';

export class MyExtension implements Extension {
  name = 'my-extension';
  version = '1.0.0';
  description = 'Description of what this extension does';
  
  private config?: ExtensionConfig;
  
  async initialize(config: ExtensionConfig): Promise<void> {
    this.config = config;
    // Perform initialization tasks
  }
  
  async shutdown(): Promise<void> {
    // Cleanup resources
  }
  
  hooks = {
    beforeRequest: async (context) => {
      // Modify or inspect request
      console.log('Processing request:', context.request);
      return { continue: true };
    },
    
    afterResponse: async (context) => {
      // Process response
      return { continue: true };
    }
  };
}

// Export factory function
export default function createExtension(): Extension {
  return new MyExtension();
}
```

### Advanced Extension Example

```typescript
// rate-limiter/index.ts
import type { Extension, RequestHook } from '../interfaces';

export class RateLimiterExtension implements Extension {
  name = 'rate-limiter';
  version = '1.0.0';
  
  private requestCounts = new Map<string, number[]>();
  private windowMs = 60000; // 1 minute
  private maxRequests = 100;
  
  hooks = {
    beforeRequest: async (context) => {
      const clientId = context.request.clientId || 'default';
      const now = Date.now();
      
      // Get or create request history
      if (!this.requestCounts.has(clientId)) {
        this.requestCounts.set(clientId, []);
      }
      
      const requests = this.requestCounts.get(clientId)!;
      
      // Remove old requests outside window
      const validRequests = requests.filter(time => now - time < this.windowMs);
      
      // Check rate limit
      if (validRequests.length >= this.maxRequests) {
        return {
          continue: false,
          data: {
            error: 'Rate limit exceeded',
            retryAfter: this.windowMs / 1000
          }
        };
      }
      
      // Record this request
      validRequests.push(now);
      this.requestCounts.set(clientId, validRequests);
      
      return { continue: true };
    }
  };
}
```

## Benefits of This Architecture

### 1. **Modularity**
- Extensions are self-contained units
- Easy to add, remove, or update functionality
- No need to modify core proxy code

### 2. **Maintainability**
- Clear separation of concerns
- Each extension handles a specific feature
- Easier to test individual components

### 3. **Extensibility**
- New hooks can be added without breaking existing extensions
- Extensions can build on top of other extensions
- Community can contribute extensions

### 4. **Performance**
- Extensions can be loaded/unloaded dynamically
- Hook execution can be optimized
- Unused extensions don't impact performance

### 5. **Developer Experience**
- Well-defined interfaces and contracts
- TypeScript support for type safety
- Clear examples and patterns to follow

### 6. **Configuration**
- Each extension can have its own configuration
- Configuration can be validated at startup
- Runtime configuration updates possible

## Future Enhancements

> **Note**: These are planned features not yet implemented

1. **Extension Discovery**: Automatic discovery of extensions in a plugins directory
2. **Extension Marketplace**: Central repository for community extensions
3. **Hot Reloading**: Reload extensions without restarting the proxy
4. **Extension Dependencies**: Allow extensions to depend on other extensions
5. **Extension CLI**: Commands for managing extensions (install, remove, list)
6. **Extension Testing Framework**: Utilities for testing extensions in isolation

## Integration Status

**Current Status**: The extension architecture is designed but not yet integrated with the main proxy. The following steps are needed for integration:

1. [ ] Integrate ExtensionRegistry with MCPProxy class
2. [ ] Add hook execution points in proxy request/response flow
3. [ ] Implement extension loading from configuration
4. [ ] Add CLI commands for extension management
5. [ ] Create comprehensive test suite
6. [ ] Document migration path for existing functionality

Once integrated, this architecture will provide a powerful way to extend mcpmon's functionality while maintaining a clean, maintainable codebase.