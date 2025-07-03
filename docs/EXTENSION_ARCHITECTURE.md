# Extension Architecture for mcpmon

## Overview

This document outlines the architecture for optional extensions in mcpmon, leveraging the existing dependency injection pattern to create isolated, pluggable features.

## Directory Structure

```
src/
├── core/                          # Core functionality (refactored from current src/)
│   ├── proxy.ts
│   ├── interfaces.ts
│   ├── index.ts
│   └── cli.ts
├── node/                          # Platform implementations (unchanged)
│   ├── NodeProcessManager.ts
│   ├── NodeFileSystem.ts
│   └── index.ts
├── extensions/                    # Optional extensions
│   ├── interfaces.ts              # Extension interfaces
│   ├── registry.ts                # Extension registry
│   ├── large-response-handler/    # Large Response Handler extension
│   │   ├── index.ts
│   │   ├── handler.ts
│   │   ├── interfaces.ts
│   │   ├── tools.ts
│   │   └── README.md
│   ├── metrics/                   # Metrics collection extension
│   │   ├── index.ts
│   │   ├── collector.ts
│   │   └── README.md
│   └── auth/                      # Authentication extension
│       ├── index.ts
│       ├── middleware.ts
│       └── README.md
└── setup.ts                       # Setup utility (unchanged)
```

## Extension Interfaces

### Core Extension Interface

```typescript
// src/extensions/interfaces.ts

import type { MCPProxy } from '../core/proxy.js';
import type { ProxyDependencies } from '../core/interfaces.js';

/**
 * Base interface for all mcpmon extensions
 */
export interface Extension {
  /** Unique identifier for the extension */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Version of the extension */
  readonly version: string;
  
  /** Whether the extension is enabled by default */
  readonly defaultEnabled: boolean;
  
  /** Configuration schema for the extension */
  readonly configSchema?: any;
  
  /** Initialize the extension */
  initialize(context: ExtensionContext): Promise<void>;
  
  /** Cleanup when extension is disabled or proxy shuts down */
  shutdown(): Promise<void>;
}

/**
 * Context provided to extensions during initialization
 */
export interface ExtensionContext {
  /** Reference to the proxy instance */
  proxy: MCPProxy;
  
  /** Original dependencies */
  dependencies: ProxyDependencies;
  
  /** Extension-specific configuration */
  config: any;
  
  /** Register hooks into proxy lifecycle */
  hooks: ExtensionHooks;
  
  /** Extension data directory */
  dataDir: string;
  
  /** Logger for the extension */
  logger: ExtensionLogger;
}

/**
 * Hooks that extensions can register
 */
export interface ExtensionHooks {
  /** Called before forwarding stdin message to server */
  beforeStdinForward?: MessageHook;
  
  /** Called after receiving stdout message from server */
  afterStdoutReceive?: MessageHook;
  
  /** Called before proxy restart */
  beforeRestart?: () => Promise<void>;
  
  /** Called after server started */
  afterServerStart?: () => Promise<void>;
  
  /** Called when proxy is shutting down */
  onShutdown?: () => Promise<void>;
}

/**
 * Message hook for intercepting/modifying messages
 */
export type MessageHook = (message: any) => Promise<any | null>;

/**
 * Logger interface for extensions
 */
export interface ExtensionLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}
```

### Extension Registry

```typescript
// src/extensions/registry.ts

import type { Extension } from './interfaces.js';

export class ExtensionRegistry {
  private extensions = new Map<string, Extension>();
  private enabled = new Set<string>();
  
  /**
   * Register an extension
   */
  register(extension: Extension): void {
    if (this.extensions.has(extension.id)) {
      throw new Error(`Extension ${extension.id} already registered`);
    }
    
    this.extensions.set(extension.id, extension);
    
    if (extension.defaultEnabled) {
      this.enabled.add(extension.id);
    }
  }
  
  /**
   * Get all registered extensions
   */
  getAll(): Extension[] {
    return Array.from(this.extensions.values());
  }
  
  /**
   * Get enabled extensions
   */
  getEnabled(): Extension[] {
    return Array.from(this.enabled)
      .map(id => this.extensions.get(id))
      .filter((ext): ext is Extension => ext !== undefined);
  }
  
  /**
   * Enable/disable an extension
   */
  setEnabled(extensionId: string, enabled: boolean): void {
    if (!this.extensions.has(extensionId)) {
      throw new Error(`Extension ${extensionId} not found`);
    }
    
    if (enabled) {
      this.enabled.add(extensionId);
    } else {
      this.enabled.delete(extensionId);
    }
  }
  
  /**
   * Load built-in extensions
   */
  async loadBuiltinExtensions(): Promise<void> {
    // Dynamically import built-in extensions
    const builtins = [
      'large-response-handler',
      'metrics',
      'auth'
    ];
    
    for (const name of builtins) {
      try {
        const module = await import(`./${name}/index.js`);
        if (module.default && 'id' in module.default) {
          this.register(module.default);
        }
      } catch (error) {
        console.error(`Failed to load extension ${name}:`, error);
      }
    }
  }
}
```

## Extension Implementation Example

### Large Response Handler Extension

```typescript
// src/extensions/large-response-handler/index.ts

import type { Extension, ExtensionContext, MessageHook } from '../interfaces.js';
import { LargeResponseHandler } from './handler.js';
import { LRH_TOOLS } from './tools.js';

export default class LargeResponseHandlerExtension implements Extension {
  readonly id = 'large-response-handler';
  readonly name = 'Large Response Handler';
  readonly version = '1.0.0';
  readonly defaultEnabled = false;
  
  readonly configSchema = {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        description: 'Response size threshold in KB',
        default: 25
      },
      dataDir: {
        type: 'string',
        description: 'Directory for persisted data'
      },
      enableDuckDB: {
        type: 'boolean',
        default: true
      }
    }
  };
  
  private handler?: LargeResponseHandler;
  private context?: ExtensionContext;
  private lastToolRequest?: any;
  
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    this.handler = new LargeResponseHandler(context.config);
    
    // Register hooks
    context.hooks.beforeStdinForward = this.beforeStdinForward.bind(this);
    context.hooks.afterStdoutReceive = this.afterStdoutReceive.bind(this);
    
    context.logger.info('Large Response Handler initialized');
  }
  
  async shutdown(): Promise<void> {
    this.handler = undefined;
    this.context = undefined;
  }
  
  private async beforeStdinForward(message: any): Promise<any> {
    // Track tool requests
    if (message.method === 'tools/call') {
      this.lastToolRequest = message;
    }
    
    // Inject our tools into tools/list responses
    if (message.method === 'tools/list' && message.id) {
      // Store the request ID to modify the response later
      this.pendingToolsListId = message.id;
    }
    
    return message; // Forward unchanged
  }
  
  private async afterStdoutReceive(message: any): Promise<any> {
    if (!this.handler) return message;
    
    // Inject tools into tools/list response
    if (message.id === this.pendingToolsListId && message.result?.tools) {
      message.result.tools.push(...LRH_TOOLS);
      this.pendingToolsListId = undefined;
      return message;
    }
    
    // Handle tool responses
    if (message.id && message.result && this.lastToolRequest) {
      const toolName = this.lastToolRequest.params?.name;
      
      if (toolName && await this.handler.shouldHandleResponse(message.result, toolName)) {
        const metadata = await this.handler.processLargeResponse(
          message.result,
          toolName,
          {
            originalRequest: this.lastToolRequest
          }
        );
        
        // Replace result with metadata
        message.result = metadata;
        
        this.context?.logger.info(
          `Large response handled: ${toolName} (${metadata.metadata.sizeKB.toFixed(1)}KB → metadata)`
        );
      }
    }
    
    return message;
  }
  
  private pendingToolsListId?: string | number;
}
```

## Integration with MCPProxy

### Modified Proxy Class

```typescript
// src/core/proxy.ts (modified sections)

import { ExtensionRegistry } from '../extensions/registry.js';
import type { ExtensionContext, ExtensionHooks } from '../extensions/interfaces.js';

export class MCPProxy {
  private extensionRegistry?: ExtensionRegistry;
  private extensionHooks: ExtensionHooks = {};
  
  constructor(
    dependencies: ProxyDependencies, 
    config: MCPProxyConfig,
    extensionRegistry?: ExtensionRegistry  // Optional extension registry
  ) {
    // ... existing constructor code ...
    
    this.extensionRegistry = extensionRegistry;
    this.initializeExtensions();
  }
  
  private async initializeExtensions(): Promise<void> {
    if (!this.extensionRegistry) return;
    
    const enabled = this.extensionRegistry.getEnabled();
    
    for (const extension of enabled) {
      try {
        const context: ExtensionContext = {
          proxy: this,
          dependencies: this.dependencies,
          config: this.config.extensions?.[extension.id] || {},
          hooks: this.extensionHooks,
          dataDir: join(this.config.dataDir || '/tmp/.mcpmon', 'extensions', extension.id),
          logger: this.createExtensionLogger(extension.id)
        };
        
        await extension.initialize(context);
      } catch (error) {
        console.error(`Failed to initialize extension ${extension.id}:`, error);
      }
    }
  }
  
  private setupStdinForwarding() {
    // ... existing code ...
    
    const forwardMessage = async (message: string) => {
      try {
        let parsed = JSON.parse(message);
        
        // Extension hook: before stdin forward
        if (this.extensionHooks.beforeStdinForward) {
          const modified = await this.extensionHooks.beforeStdinForward(parsed);
          if (modified === null) return; // Extension blocked the message
          parsed = modified;
          message = JSON.stringify(parsed) + "\n";
        }
        
        // ... rest of existing forwarding logic ...
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };
  }
  
  private setupOutputForwarding() {
    // ... existing stdout handling ...
    
    stdout.on("data", async (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(line => line.trim());
      
      for (const line of lines) {
        try {
          let message = JSON.parse(line);
          
          // Extension hook: after stdout receive
          if (this.extensionHooks.afterStdoutReceive) {
            const modified = await this.extensionHooks.afterStdoutReceive(message);
            if (modified === null) continue; // Extension blocked the message
            message = modified;
          }
          
          this.stdout.write(JSON.stringify(message) + "\n");
        } catch (e) {
          // Not JSON, forward as-is
          this.stdout.write(line + "\n");
        }
      }
    });
  }
}
```

## Configuration

### Extended MCPProxyConfig

```typescript
// src/core/interfaces.ts (additions)

export interface MCPProxyConfig {
  // ... existing config ...
  
  /** Extension configurations */
  extensions?: {
    [extensionId: string]: any;
  };
  
  /** Data directory for extensions */
  dataDir?: string;
}
```

### CLI Integration

```typescript
// src/core/cli.ts (modifications)

import { ExtensionRegistry } from '../extensions/registry.js';

// Load extensions
const registry = new ExtensionRegistry();
await registry.loadBuiltinExtensions();

// Parse extension flags
program
  .option('--enable-extension <ids...>', 'Enable specific extensions')
  .option('--disable-extension <ids...>', 'Disable specific extensions')
  .option('--list-extensions', 'List available extensions');

// Handle extension configuration
if (options.listExtensions) {
  const extensions = registry.getAll();
  console.log('Available extensions:');
  for (const ext of extensions) {
    console.log(`  ${ext.id} (${ext.name}) v${ext.version}`);
  }
  process.exit(0);
}

// Enable/disable extensions
if (options.enableExtension) {
  for (const id of options.enableExtension) {
    registry.setEnabled(id, true);
  }
}

// Create proxy with extension registry
const proxy = new MCPProxy(dependencies, config, registry);
```

## Benefits of This Architecture

1. **Isolation**: Each extension is completely isolated in its own directory
2. **Dependency Injection**: Extensions receive dependencies through context
3. **Pluggability**: Extensions can be enabled/disabled without code changes
4. **Testability**: Each extension can be tested independently with mocks
5. **Type Safety**: Full TypeScript support with interfaces
6. **Lifecycle Management**: Clear initialization and shutdown phases
7. **Hook System**: Extensions can intercept and modify proxy behavior
8. **Configuration**: Each extension has its own configuration section

## Future Extensions

This architecture supports various extension types:

- **Security**: Authentication, authorization, rate limiting
- **Monitoring**: Metrics, logging, tracing, APM integration
- **Transformation**: Request/response transformation, validation
- **Storage**: Alternative storage backends for Large Response Handler
- **Protocol**: Support for additional protocols beyond MCP
- **Development**: Debugging tools, profiling, request replay

## Migration Plan

1. Create `src/core/` directory and move existing files
2. Create `src/extensions/` directory structure
3. Move `large-response-handler.ts` to proper extension directory
4. Implement extension registry and hooks
5. Update imports throughout the codebase
6. Add extension support to CLI
7. Write tests for extension system
8. Document extension API for third-party developers

This architecture maintains backward compatibility while enabling powerful extensibility for mcpmon.