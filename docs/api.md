# API Documentation

mcpmon provides both command-line interfaces and programmatic APIs for hot-reload MCP servers during development.

## Table of Contents

- [Command Line Interface](#command-line-interface)
- [Environment Variables](#environment-variables)
- [Programmatic API](#programmatic-api)
- [Events and Logging](#events-and-logging)
- [Error Handling](#error-handling)
- [Migration Guide](#migration-guide)
- [Library Usage](#library-usage)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)
- [Integration Examples](#integration-examples)
- [Migration from Legacy mcp-hmr Tool](#migration-from-legacy-mcp-hmr-tool)

## Command Line Interface

### Basic Usage

```bash
# Simple nodemon-like usage
mcpmon node server.js
mcpmon python server.py
mcpmon deno run --allow-all server.ts

# With arguments
mcpmon node --inspect server.js
mcpmon python server.py --port 3000
```

### Usage with MCP Inspector

```bash
# Direct command
npx @modelcontextprotocol/inspector mcpmon node server.js

# With environment variables
API_KEY=your-key npx @modelcontextprotocol/inspector mcpmon node server.js
```

### Help

```bash
# Show help
mcpmon --help

# Also shows help when called without arguments
mcpmon
```

## Environment Variables

### Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCPMON_WATCH` | Auto-detected | Override files/directories to watch (comma-separated) |
| `MCPMON_DELAY` | `1000` | Restart delay in milliseconds |
| `MCPMON_VERBOSE` | `false` | Enable verbose logging |

### Usage Examples

```bash
# Override which files to watch
MCPMON_WATCH="server.js,config.json" mcpmon node server.js

# Change restart delay
MCPMON_DELAY=500 mcpmon node server.js

# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon node server.js

# Combine multiple options
MCPMON_VERBOSE=1 MCPMON_DELAY=2000 mcpmon node server.js
```

## Programmatic API

### createMCPProxy Function

The `createMCPProxy` function provides a simplified interface for creating MCP proxies with Node.js implementations.

```typescript
import { createMCPProxy } from "mcpmon";

// Create and start proxy
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: ["server.js", "config.json"], // Files/directories to monitor
  restartDelay: 1000,
  env: { API_KEY: "your-key" }
});

// Start the proxy (runs indefinitely)
proxy.start();

// Handle shutdown
process.on("SIGTERM", async () => {
  await proxy.shutdown();
  process.exit(0);
});
```

### Configuration Interface

The `createMCPProxy` function accepts a configuration object that implements the `MCPProxyConfig` interface:

```typescript
interface MCPProxyConfig {
  /** Command to execute (e.g., 'node', 'python', 'deno') */
  command: string;
  
  /** Arguments passed to the command */
  args: string[];
  
  /** 
   * @deprecated Use watchTargets instead. Single file/directory to watch.
   * This parameter is deprecated and will be removed in a future version.
   * Use watchTargets array for more flexible monitoring options.
   */
  entryFile?: string;
  
  /** Array of files, directories, packages, or other resources to monitor */
  watchTargets?: string[];
  
  /** Restart delay in milliseconds (default: 1000) */
  restartDelay?: number;
  
  /** Environment variables to pass to server */
  env?: Record<string, string>;
  
  /** Maximum time to wait for graceful shutdown (default: 1000) */
  killDelay?: number;
  
  /** Delay after server starts before considering it ready (default: 2000) */
  readyDelay?: number;
  
  /** Extension configuration for additional functionality */
  extensions?: Record<string, any>;
}

function createMCPProxy(config: MCPProxyConfig): Promise<MCPProxy>
```

### Migration from entryFile to watchTargets

⚠️ **Deprecation Notice**: The `entryFile` parameter is deprecated and will be removed in a future version. Use `watchTargets` instead for more flexible monitoring capabilities.

**Migration Examples:**

```typescript
// OLD: Single file monitoring with entryFile (deprecated)
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  entryFile: "server.js"  // ❌ Deprecated - will be removed
});

// NEW: Single file monitoring with watchTargets
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: ["server.js"]  // ✅ Recommended approach
});

// NEW: Multiple file monitoring (not possible with entryFile)
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: [
    "server.js",           // Main server file
    "config.json",         // Configuration file
    "package.json",        // Dependencies
    "src/",                // Source directory
    "lib/handlers/"        // Specific subdirectory
  ]
});
```

**Automatic Migration:**
For backward compatibility, `entryFile` is automatically converted to `watchTargets` internally:

```typescript
// This configuration...
const config = {
  command: "node",
  args: ["server.js"],
  entryFile: "server.js"
};

// ...is automatically converted to:
const migratedConfig = {
  command: "node",
  args: ["server.js"],
  watchTargets: ["server.js"]
};
```

### watchTargets Configuration

The `watchTargets` array allows monitoring multiple files, directories, or resources:

```typescript
// Monitor multiple files
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: [
    "server.js",           // Main server file
    "config.json",         // Configuration file
    "package.json",        // Dependencies
    "src/",                // Source directory
    "lib/handlers/"        // Specific subdirectory
  ]
});

// Auto-detection (when watchTargets not specified)
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  // watchTargets automatically detected from args
});
```

### Extension Configuration

Extensions can be configured to add custom functionality to the proxy. Each extension is identified by a kebab-case name and configured with extension-specific options:

```typescript
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: ["server.js"],
  extensions: {
    // Large Response Handler Extension
    "large-response-handler": {
      threshold: 25 * 1024,           // Response size threshold in bytes (25KB)
      dataDir: "/tmp/mcpmon-data",    // Directory for storing large responses
      enableDuckDB: true,             // Enable DuckDB for response analysis
      compressionLevel: 6,            // Compression level (0-9)
      maxStoredResponses: 100,        // Maximum number of stored responses
      retentionDays: 7                // Days to retain stored responses
    },
    
    // Request Logger Extension
    "request-logger": {
      logLevel: "info",               // Log level: debug, info, warn, error
      includeTimestamps: true,        // Include timestamps in log entries
      logFile: "/tmp/mcpmon.log",     // Optional log file path
      maxLogSize: 10 * 1024 * 1024    // Maximum log file size (10MB)
    },
    
    // Custom Extension Example
    "custom-extension": {
      enabled: true,                  // Enable/disable extension
      customOption: "value",          // Extension-specific configuration
      numericSetting: 42             // Any extension-specific options
    }
  }
});
```

**Extension Naming Convention:**
- Extension names must use kebab-case (e.g., `large-response-handler`, `request-logger`)
- Extension configuration objects support any structure required by the extension
- Extensions are loaded and configured during proxy initialization

**Built-in Extensions:**
- `large-response-handler`: Handles large MCP responses by storing them externally
- `request-logger`: Logs MCP requests and responses for debugging

**Environment Variable Override:**
Extensions can be configured via environment variables using the pattern `MCPMON_EXT_<EXTENSION_NAME>_<OPTION>`:

```bash
# Configure large-response-handler threshold
MCPMON_EXT_LARGE_RESPONSE_HANDLER_THRESHOLD=50000 mcpmon node server.js

# Configure request-logger log level
MCPMON_EXT_REQUEST_LOGGER_LOG_LEVEL=debug mcpmon node server.js
```

### MCPProxy Methods

```typescript
class MCPProxy {
  /** Start the proxy and initial server */
  async start(): Promise<void>;

  /** Stop the proxy and server */
  async shutdown(): Promise<void>;

  /** Restart the server (debounced) */
  readonly restart: () => Promise<void>;
}
```

### Backward Compatibility

The deprecated `entryFile` parameter is automatically converted to `watchTargets` for backward compatibility:

```typescript
// Old API (still supported but deprecated)
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  entryFile: "server.js", // Automatically converted to watchTargets: ["server.js"]
});

// New API (recommended)
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchTargets: ["server.js", "config.json"],
});
```

## Events and Logging

### Verbose Logging

Enable verbose logging with `MCPMON_VERBOSE=1`:

```
🔧 mcpmon starting...
📟 Command: node server.js
👀 Watching: /path/to/server.js
📝 File change detected: server.js
🔄 File change detected, restarting server...
🛑 Killing server process...
✅ Server restarted successfully
```

### Log Prefixes

- 🔧 **Startup**: mcpmon initialization
- 📟 **Command**: Server command and arguments  
- 👀 **Watching**: Files being monitored
- 📝 **File changes**: Change events detected
- 🔄 **Restart**: Server restart sequence
- 🛑 **Shutdown**: Graceful shutdown process
- ✅ **Success**: Operations completed
- ❌ **Errors**: Detailed error information

### Standard Output vs Error Output

- **stdout**: JSON-RPC messages only (for MCP communication)
- **stderr**: All logging and status messages (when verbose enabled)

## Error Handling

### Common Error Scenarios

1. **Command not found**
   ```
   Error: spawn node ENOENT
   ```

2. **File not found**
   ```
   Error: No file to watch detected
   ```

3. **Server startup failure**
   ```
   Error: Server process exited with code 1
   ```

4. **Permission denied**
   ```
   Error: EACCES: permission denied
   ```

### Error Recovery

mcpmon automatically handles many error conditions:

- **Server crashes**: Automatically restarts the server
- **File watch errors**: Attempts to re-establish file watching
- **Process cleanup**: Ensures proper cleanup on shutdown
- **Signal handling**: Graceful shutdown on SIGINT/SIGTERM

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Normal shutdown |
| 1 | General error |
| 130 | Interrupted (Ctrl+C) |

## Migration Guide

### Migrating from v0.2.x to v0.3.x

This section covers breaking changes and migration steps when upgrading from mcpmon v0.2.x to v0.3.x.

#### Breaking Changes Overview

The v0.3.x release introduces several architectural improvements and breaking changes:

1. **Extension System**: Complete overhaul of the extension architecture
2. **Configuration Format**: Changes to configuration object structure
3. **API Changes**: Modified method signatures and return types
4. **Environment Variables**: Updated environment variable naming conventions

#### Extension System Migration

**v0.2.x Extension Configuration:**
```typescript
// OLD: v0.2.x extension configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js'],
  extensions: {
    largeResponseHandler: {  // ❌ camelCase naming
      enabled: true,
      threshold: 25600,
      dataDir: '/tmp/data'
    },
    requestLogger: {         // ❌ camelCase naming
      enabled: true,
      logLevel: 'info'
    }
  }
});
```

**v0.3.x Extension Configuration:**
```typescript
// NEW: v0.3.x extension configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js'],
  extensions: {
    'large-response-handler': {  // ✅ kebab-case naming
      threshold: 25 * 1024,      // ✅ explicit threshold calculation
      dataDir: '/tmp/mcpmon-data',
      enableDuckDB: true,        // ✅ new options available
      compressionLevel: 6,
      maxStoredResponses: 100,
      retentionDays: 7
    },
    'request-logger': {          // ✅ kebab-case naming
      logLevel: 'info',
      includeTimestamps: true,   // ✅ new options available
      logFile: '/tmp/mcpmon.log',
      maxLogSize: 10 * 1024 * 1024,
      structuredLogging: true
    }
  }
});
```

**Extension Migration Steps:**

1. **Update Extension Names**: Convert all extension names from camelCase to kebab-case
   - `largeResponseHandler` → `large-response-handler`
   - `requestLogger` → `request-logger`
   - `performanceMonitor` → `performance-monitor`

2. **Remove `enabled` Property**: Extensions are enabled by default when configured
   ```typescript
   // OLD: v0.2.x
   extensions: {
     'large-response-handler': {
       enabled: true,  // ❌ Remove this property
       threshold: 25600
     }
   }
   
   // NEW: v0.3.x
   extensions: {
     'large-response-handler': {
       threshold: 25 * 1024  // ✅ Extension enabled by presence
     }
   }
   ```

3. **Update Configuration Options**: Many extensions have new required and optional configuration options
   ```typescript
   // OLD: v0.2.x minimal configuration
   'large-response-handler': {
     threshold: 25600
   }
   
   // NEW: v0.3.x enhanced configuration
   'large-response-handler': {
     threshold: 25 * 1024,           // ✅ explicit calculation
     dataDir: '/tmp/mcpmon-data',    // ✅ explicit data directory
     enableDuckDB: true,             // ✅ new database integration
     compressionLevel: 6,            // ✅ compression settings
     maxStoredResponses: 100,        // ✅ storage limits
     retentionDays: 7                // ✅ automatic cleanup
   }
   ```

#### Configuration Format Changes

**Environment Variable Updates:**

```bash
# OLD: v0.2.x environment variables
MCP_EXTENSION_LARGE_RESPONSE_THRESHOLD=25600    # ❌ Old naming
MCP_EXTENSION_REQUEST_LOGGER_LEVEL=info         # ❌ Old naming

# NEW: v0.3.x environment variables  
MCPMON_EXT_LARGE_RESPONSE_HANDLER_THRESHOLD=25600  # ✅ New naming convention
MCPMON_EXT_REQUEST_LOGGER_LOG_LEVEL=info           # ✅ New naming convention
```

**Configuration Object Changes:**

```typescript
// OLD: v0.2.x configuration structure
interface MCPProxyConfig {
  command: string;
  args: string[];
  entryFile?: string;        // ❌ Deprecated parameter
  watchTargets?: string[];
  restartDelay?: number;
  extensions?: {
    [key: string]: {         // ❌ Extension names were camelCase
      enabled: boolean;      // ❌ Explicit enabled property required
      [key: string]: any;
    }
  };
}

// NEW: v0.3.x configuration structure
interface MCPProxyConfig {
  command: string;
  args: string[];
  /** @deprecated Use watchTargets instead */
  entryFile?: string;        // ✅ Still supported but deprecated
  watchTargets?: string[];
  restartDelay?: number;
  killDelay?: number;        // ✅ New graceful shutdown option
  readyDelay?: number;       // ✅ New server readiness option
  env?: Record<string, string>;  // ✅ Environment variable support
  extensions?: {
    [key: string]: any;      // ✅ kebab-case names, no enabled property
  };
}
```

#### Code Migration Examples

**Complete Migration Example:**

```typescript
// OLD: v0.2.x implementation
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  entryFile: 'server.js',  // ❌ Deprecated
  restartDelay: 1000,
  extensions: {
    largeResponseHandler: {  // ❌ camelCase
      enabled: true,         // ❌ Explicit enabled
      threshold: 25600
    },
    requestLogger: {         // ❌ camelCase
      enabled: true,         // ❌ Explicit enabled
      logLevel: 'info'
    }
  }
});

await proxy.start();

// NEW: v0.3.x implementation
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'config.json'],  // ✅ Use watchTargets
  restartDelay: 1000,
  killDelay: 5000,          // ✅ New graceful shutdown option
  readyDelay: 2000,         // ✅ New server readiness option
  env: {                    // ✅ Environment variable support
    NODE_ENV: 'development',
    API_KEY: process.env.API_KEY
  },
  extensions: {
    'large-response-handler': {  // ✅ kebab-case naming
      threshold: 25 * 1024,      // ✅ Explicit calculation
      dataDir: '/tmp/mcpmon-data',
      enableDuckDB: true,
      compressionLevel: 6,
      maxStoredResponses: 100,
      retentionDays: 7
    },
    'request-logger': {          // ✅ kebab-case naming
      logLevel: 'info',
      includeTimestamps: true,
      logFile: '/tmp/mcpmon.log',
      maxLogSize: 10 * 1024 * 1024,
      structuredLogging: true
    }
  }
});

await proxy.start();
```

**Migration Checklist:**

- [ ] Update extension names from camelCase to kebab-case
- [ ] Remove `enabled` properties from extension configurations
- [ ] Replace `entryFile` with `watchTargets` array
- [ ] Update environment variable names to use `MCPMON_EXT_` prefix
- [ ] Add new configuration options like `killDelay`, `readyDelay`, and `env`
- [ ] Review and update extension-specific configuration options
- [ ] Test all extensions work correctly with new configuration format
- [ ] Update any CI/CD scripts that use environment variables
- [ ] Update documentation and configuration files

**Automated Migration Script:**

```bash
#!/bin/bash
# migrate-config.sh - Automated configuration migration helper

echo "Migrating mcpmon configuration from v0.2.x to v0.3.x..."

# Update environment variables in .env files
find . -name "*.env*" -type f -exec sed -i.bak \
  -e 's/MCP_EXTENSION_/MCPMON_EXT_/g' \
  -e 's/_LARGE_RESPONSE_/_LARGE_RESPONSE_HANDLER_/g' \
  -e 's/_REQUEST_LOGGER_LEVEL/_REQUEST_LOGGER_LOG_LEVEL/g' \
  {} \;

# Update TypeScript/JavaScript configuration files
find . -name "*.ts" -o -name "*.js" -type f -exec sed -i.bak \
  -e 's/largeResponseHandler/large-response-handler/g' \
  -e 's/requestLogger/request-logger/g' \
  -e 's/performanceMonitor/performance-monitor/g' \
  {} \;

echo "Migration complete. Please review changes and test your configuration."
echo "Backup files created with .bak extension."
```

## Library Usage

### Using mcpmon as a Library

mcpmon can be imported and used as a library in your Node.js applications. The recommended approach is to use the `createMCPProxy` helper function:

```typescript
import { createMCPProxy } from 'mcpmon';

// Simple setup with watchTargets
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'config.json'],
  restartDelay: 1000,
  env: { API_KEY: 'your-key' }
});

// Start the proxy
await proxy.start();
```

### Advanced Library Usage

For more control, you can use the low-level MCPProxy class directly:

```typescript
import { MCPProxy, NodeProcessManager, NodeFileSystem } from 'mcpmon';

// Create custom proxy with platform implementations
const proxy = new MCPProxy({
  procManager: new NodeProcessManager(),
  fs: new NodeFileSystem(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  exit: process.exit
}, {
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'config.json'],
  restartDelay: 1000,
  extensions: {
    'large-response-handler': {
      threshold: 25 * 1024,
      dataDir: '/tmp/mcpmon-data',
      enableDuckDB: true,
      compressionLevel: 6,
      maxStoredResponses: 100,
      retentionDays: 7
    }
  }
});

await proxy.start();
```

## Examples

This section provides comprehensive examples of extension integration, container management, and advanced configuration patterns for mcpmon.

### Extension Integration Examples

#### Large Response Handler Extension

The large response handler extension automatically manages large MCP responses by storing them externally and providing efficient access patterns.

```typescript
import { createMCPProxy } from 'mcpmon';

// Basic large response handler configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'src/'],
  extensions: {
    'large-response-handler': {
      threshold: 25 * 1024,           // 25KB threshold
      dataDir: '/tmp/mcpmon-data',    // Storage directory
      enableDuckDB: true,             // Enable DuckDB for analysis
      compressionLevel: 6,            // Compression level (0-9)
      maxStoredResponses: 100,        // Maximum stored responses
      retentionDays: 7                // Retention period
    }
  }
});

await proxy.start();
```

#### Request Logger Extension

The request logger extension provides comprehensive logging of MCP requests and responses for debugging and monitoring.

```typescript
import { createMCPProxy } from 'mcpmon';

// Request logger with file output and filtering
const proxy = await createMCPProxy({
  command: 'python',
  args: ['server.py'],
  watchTargets: ['server.py', 'config.json'],
  extensions: {
    'request-logger': {
      logLevel: 'debug',              // Log level: debug, info, warn, error
      includeTimestamps: true,        // Include timestamps
      logFile: '/var/log/mcpmon.log', // Log file path
      maxLogSize: 10 * 1024 * 1024,   // 10MB maximum file size
      filterSensitive: true,          // Filter sensitive data
      requestFilters: [               // Request filtering patterns
        '*.sensitive',
        '*.password',
        '*.token'
      ]
    }
  }
});

await proxy.start();
```

#### Multiple Extension Configuration

Combine multiple extensions for comprehensive monitoring and debugging capabilities.

```typescript
import { createMCPProxy } from 'mcpmon';

// Multi-extension configuration with advanced settings
const proxy = await createMCPProxy({
  command: 'deno',
  args: ['run', '--allow-all', 'server.ts'],
  watchTargets: ['server.ts', 'deps.ts', 'config/'],
  restartDelay: 2000,
  killDelay: 5000,
  readyDelay: 3000,
  extensions: {
    'large-response-handler': {
      threshold: 50 * 1024,           // 50KB threshold for Deno server
      dataDir: '/opt/mcpmon/data',
      enableDuckDB: true,
      compressionLevel: 9,            // Maximum compression
      maxStoredResponses: 200,
      retentionDays: 14,
      enableMetrics: true,            // Enable performance metrics
      metricsPort: 9090               // Prometheus metrics port
    },
    'request-logger': {
      logLevel: 'info',
      includeTimestamps: true,
      logFile: '/opt/mcpmon/logs/requests.log',
      maxLogSize: 50 * 1024 * 1024,   // 50MB log file
      rotateOnSize: true,             // Enable log rotation
      maxLogFiles: 5,                 // Keep 5 log files
      structuredLogging: true,        // JSON structured logs
      correlationIds: true            // Add correlation IDs
    },
    'performance-monitor': {
      enabled: true,
      sampleRate: 0.1,               // Sample 10% of requests
      slowRequestThreshold: 1000,     // Log requests > 1 second
      memoryThreshold: 100 * 1024 * 1024, // Alert on > 100MB memory
      alertWebhook: 'https://alerts.example.com/webhook'
    }
  }
});

await proxy.start();
```

### Container Management API Usage

#### Docker Container Integration

Manage mcpmon within Docker containers with proper configuration and volume mounting.

```typescript
import { createMCPProxy } from 'mcpmon';
import { promises as fs } from 'fs';

// Container-aware configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: [
    '/app/server.js',               // Container path
    '/app/src/',                    // Source directory
    '/config/settings.json',        // Mounted config
    '/data/schema.sql'              // Mounted data files
  ],
  env: {
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
    DATA_DIR: '/data',
    CONFIG_DIR: '/config'
  },
  extensions: {
    'large-response-handler': {
      dataDir: '/data/mcpmon',       // Persistent volume
      threshold: 10 * 1024,         // Smaller threshold in containers
      enableDuckDB: false,          // Disable heavy features
      compressionLevel: 3           // Balanced compression
    },
    'container-monitor': {
      enabled: true,
      containerName: 'mcp-server',
      healthCheckInterval: 30000,   // 30 second health checks
      resourceLimits: {
        memory: '512MB',
        cpu: '0.5'
      }
    }
  }
});

// Container lifecycle management
process.on('SIGTERM', async () => {
  console.log('Container shutdown signal received');
  await proxy.shutdown();
  process.exit(0);
});

await proxy.start();
```

#### Kubernetes Pod Configuration

Configure mcpmon for Kubernetes environments with proper resource management and service discovery.

```typescript
import { createMCPProxy } from 'mcpmon';

// Kubernetes-optimized configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['--max-old-space-size=256', 'server.js'], // Memory-constrained
  watchTargets: [
    '/app/server.js',
    '/config-volume/config.json',   // ConfigMap mount
    '/secrets-volume/credentials'   // Secret mount
  ],
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development',
    POD_NAME: process.env.HOSTNAME,
    NAMESPACE: process.env.POD_NAMESPACE || 'default',
    SERVICE_ACCOUNT: process.env.SERVICE_ACCOUNT || 'default'
  },
  restartDelay: 5000,              // Longer delay for K8s
  killDelay: 10000,                // Graceful termination
  readyDelay: 5000,                // Pod readiness delay
  extensions: {
    'large-response-handler': {
      dataDir: '/data-volume/mcpmon', // PersistentVolume
      threshold: 15 * 1024,
      enableDuckDB: false,          // Avoid heavy operations
      maxStoredResponses: 50,       // Resource constraints
      retentionDays: 3
    },
    'kubernetes-monitor': {
      enabled: true,
      podMetricsPort: 8080,         // Metrics for Prometheus
      healthCheckPath: '/health',   // Health check endpoint
      readinessPath: '/ready',      // Readiness probe
      livenessPath: '/live'         // Liveness probe
    }
  }
});

// Kubernetes signal handling
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, initiating graceful shutdown`);
    await proxy.shutdown();
    process.exit(0);
  });
});

await proxy.start();
```

### Advanced Configuration Patterns

#### Environment-Based Configuration

Dynamically configure mcpmon based on environment variables and runtime conditions.

```typescript
import { createMCPProxy } from 'mcpmon';

// Environment-aware configuration factory
function createEnvironmentConfig() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  const isContainer = !!process.env.KUBERNETES_SERVICE_HOST;

  return {
    command: process.env.SERVER_COMMAND || 'node',
    args: [
      ...(isDevelopment ? ['--inspect'] : []),
      ...(process.env.SERVER_ARGS?.split(' ') || []),
      'server.js'
    ],
    watchTargets: [
      'server.js',
      ...(isDevelopment ? ['src/', 'test/', 'config.json'] : ['server.js']),
      ...(process.env.EXTRA_WATCH_TARGETS?.split(',') || [])
    ],
    restartDelay: isDevelopment ? 1000 : 5000,
    killDelay: isContainer ? 10000 : 5000,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: isDevelopment ? 'debug' : 'info',
      ...(process.env.CUSTOM_ENV_VARS ? JSON.parse(process.env.CUSTOM_ENV_VARS) : {})
    },
    extensions: {
      'large-response-handler': {
        threshold: parseInt(process.env.RESPONSE_THRESHOLD || '25600'),
        dataDir: process.env.DATA_DIR || '/tmp/mcpmon-data',
        enableDuckDB: !isContainer, // Disable in containers
        compressionLevel: isProduction ? 9 : 6,
        maxStoredResponses: parseInt(process.env.MAX_RESPONSES || '100'),
        retentionDays: parseInt(process.env.RETENTION_DAYS || '7')
      },
      'request-logger': {
        logLevel: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
        includeTimestamps: true,
        logFile: process.env.LOG_FILE,
        maxLogSize: parseInt(process.env.MAX_LOG_SIZE || '10485760'),
        structuredLogging: isProduction,
        filterSensitive: isProduction
      }
    }
  };
}

// Create proxy with environment configuration
const proxy = await createMCPProxy(createEnvironmentConfig());
await proxy.start();
```

#### Multi-Server Configuration

Manage multiple MCP servers with shared configuration and cross-server communication.

```typescript
import { createMCPProxy } from 'mcpmon';

// Multi-server configuration with shared extensions
class MultiServerManager {
  private proxies: Map<string, any> = new Map();
  private sharedConfig = {
    restartDelay: 2000,
    killDelay: 5000,
    extensions: {
      'large-response-handler': {
        threshold: 25 * 1024,
        dataDir: '/shared/mcpmon-data',
        enableDuckDB: true,
        compressionLevel: 6,
        maxStoredResponses: 200,
        retentionDays: 14
      },
      'request-logger': {
        logLevel: 'info',
        includeTimestamps: true,
        logFile: '/shared/logs/mcpmon-requests.log',
        maxLogSize: 20 * 1024 * 1024,
        structuredLogging: true,
        correlationIds: true
      },
      'cross-server-monitor': {
        enabled: true,
        broadcastPort: 9091,
        healthCheckInterval: 30000,
        serverDiscovery: true
      }
    }
  };

  async addServer(name: string, config: any) {
    const proxy = await createMCPProxy({
      ...this.sharedConfig,
      ...config,
      extensions: {
        ...this.sharedConfig.extensions,
        ...config.extensions,
        'server-identity': {
          serverName: name,
          instanceId: `${name}-${Date.now()}`,
          startTime: new Date().toISOString()
        }
      }
    });

    this.proxies.set(name, proxy);
    return proxy;
  }

  async startAll() {
    const startPromises = Array.from(this.proxies.values()).map(
      proxy => proxy.start()
    );
    await Promise.all(startPromises);
  }

  async shutdownAll() {
    const shutdownPromises = Array.from(this.proxies.values()).map(
      proxy => proxy.shutdown()
    );
    await Promise.all(shutdownPromises);
  }
}

// Usage example
const manager = new MultiServerManager();

// Add multiple servers with different configurations
await manager.addServer('auth-server', {
  command: 'node',
  args: ['auth-server.js'],
  watchTargets: ['auth-server.js', 'auth-config.json'],
  env: { PORT: '3001', SERVICE_NAME: 'auth' }
});

await manager.addServer('data-server', {
  command: 'python',
  args: ['data-server.py'],
  watchTargets: ['data-server.py', 'data-config.yaml'],
  env: { PORT: '3002', SERVICE_NAME: 'data' }
});

await manager.addServer('api-gateway', {
  command: 'deno',
  args: ['run', '--allow-all', 'gateway.ts'],
  watchTargets: ['gateway.ts', 'routes/'],
  env: { PORT: '3000', SERVICE_NAME: 'gateway' }
});

await manager.startAll();
```

### Error Handling Examples

#### Comprehensive Error Recovery

Implement robust error handling with automatic recovery and alerting mechanisms.

```typescript
import { createMCPProxy } from 'mcpmon';

// Enhanced error handling configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'src/'],
  extensions: {
    'error-handler': {
      enabled: true,
      maxRetries: 3,                 // Maximum restart attempts
      retryDelay: 5000,              // Delay between retries
      exponentialBackoff: true,      // Use exponential backoff
      healthCheckUrl: 'http://localhost:3000/health',
      healthCheckInterval: 30000,    // Health check every 30 seconds
      alertOnFailure: true,
      alertWebhook: 'https://alerts.example.com/webhook',
      fallbackCommand: ['node', 'fallback-server.js'] // Fallback server
    },
    'circuit-breaker': {
      enabled: true,
      failureThreshold: 5,           // Open circuit after 5 failures
      resetTimeout: 60000,           // Reset after 1 minute
      halfOpenMaxCalls: 3,           // Test with 3 calls in half-open state
      monitoredPaths: ['/api', '/health']
    }
  }
});

// Custom error handling
proxy.on('error', async (error) => {
  console.error('Proxy error:', error);
  
  // Log to external service
  await fetch('https://logging.example.com/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      service: 'mcpmon-proxy'
    })
  });
});

proxy.on('server-restart', (attempt) => {
  console.log(`Server restart attempt ${attempt}`);
});

proxy.on('server-failure', async (error) => {
  console.error('Server failure:', error);
  
  // Send alert
  await fetch(process.env.ALERT_WEBHOOK!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `MCP Server failure: ${error.message}`,
      severity: 'high',
      timestamp: new Date().toISOString()
    })
  });
});

await proxy.start();
```

#### Graceful Degradation

Implement graceful degradation strategies when extensions or services fail.

```typescript
import { createMCPProxy } from 'mcpmon';

// Graceful degradation configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js'],
  extensions: {
    'graceful-degradation': {
      enabled: true,
      fallbackBehaviors: {
        'large-response-handler': {
          onFailure: 'passthrough',   // Pass responses directly
          fallbackThreshold: 100 * 1024, // Higher threshold as fallback
          retryInterval: 300000       // Retry every 5 minutes
        },
        'request-logger': {
          onFailure: 'memory-buffer', // Buffer in memory
          maxBufferSize: 1000,        // Maximum buffered requests
          fallbackLogLevel: 'error'   // Only log errors
        }
      },
      circuitBreaker: {
        enabled: true,
        services: ['database', 'cache', 'external-api'],
        defaultTimeout: 5000,
        fallbackResponses: {
          'database': { error: 'Database temporarily unavailable' },
          'cache': { cached: false, source: 'fallback' },
          'external-api': { status: 'degraded', reason: 'service unavailable' }
        }
      }
    },
    'health-monitor': {
      enabled: true,
      endpoints: [
        { url: 'http://localhost:3000/health', timeout: 5000 },
        { url: 'http://localhost:3001/ready', timeout: 3000 }
      ],
      degradationLevels: {
        'full': { allServicesHealthy: true },
        'partial': { coreServicesHealthy: true },
        'minimal': { essentialServicesHealthy: true }
      }
    }
  }
});

// Handle degradation events
proxy.on('degradation-level-changed', (level) => {
  console.log(`System degradation level changed to: ${level}`);
  
  // Adjust behavior based on degradation level
  switch (level) {
    case 'minimal':
      // Disable non-essential features
      proxy.disableExtension('request-logger');
      break;
    case 'partial':
      // Re-enable some features
      proxy.enableExtension('request-logger', { logLevel: 'error' });
      break;
    case 'full':
      // Restore all features
      proxy.enableAllExtensions();
      break;
  }
});

await proxy.start();
```

#### Extension Error Isolation

Prevent extension failures from affecting core proxy functionality.

```typescript
import { createMCPProxy } from 'mcpmon';

// Extension error isolation configuration
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js'],
  extensions: {
    'error-isolation': {
      enabled: true,
      isolationLevel: 'extension',   // Isolate at extension level
      timeoutMs: 5000,               // Extension operation timeout
      maxMemoryMB: 100,              // Memory limit per extension
      errorThreshold: 10,            // Disable after 10 errors
      recoveryInterval: 300000,      // Attempt recovery every 5 minutes
      quarantineEnabled: true        // Quarantine problematic extensions
    },
    'large-response-handler': {
      threshold: 25 * 1024,
      dataDir: '/tmp/mcpmon-data',
      enableDuckDB: true,
      errorHandling: {
        continueOnError: true,       // Don't stop proxy on extension error
        fallbackBehavior: 'passthrough',
        logErrors: true,
        maxErrorRate: 0.1            // Disable if error rate > 10%
      }
    },
    'request-logger': {
      logLevel: 'info',
      logFile: '/tmp/mcpmon.log',
      errorHandling: {
        continueOnError: true,
        fallbackBehavior: 'memory-buffer',
        maxRetries: 3,
        retryDelay: 1000
      }
    }
  }
});

// Monitor extension health
proxy.on('extension-error', (extensionName, error) => {
  console.warn(`Extension ${extensionName} error:`, error.message);
  
  // Log extension errors separately
  console.log(`Extension ${extensionName} will continue operating in degraded mode`);
});

proxy.on('extension-quarantined', (extensionName, reason) => {
  console.error(`Extension ${extensionName} quarantined: ${reason}`);
  
  // Notify administrators
  console.log(`Manual intervention may be required for ${extensionName}`);
});

proxy.on('extension-recovered', (extensionName) => {
  console.info(`Extension ${extensionName} has recovered and is fully operational`);
});

await proxy.start();
```

## Advanced Usage

### File Detection

mcpmon automatically detects which files to watch:

1. Looks for the first script file in your arguments (`.js`, `.mjs`, `.ts`, `.py`, `.rb`, `.php`)
2. Falls back to current directory if no script file found
3. Can be overridden with `MCPMON_WATCH` environment variable

### Multiple File Monitoring

Watch multiple files or directories using environment variables:

```bash
# Multiple files
MCPMON_WATCH="server.js,config.json,package.json" mcpmon node server.js

# Directories and files
MCPMON_WATCH="src/,config/settings.json,package.json" mcpmon node server.js
```

Or configure programmatically with `watchTargets`:

```typescript
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: [
    'server.js',              // Main server file
    'config.json',            // Configuration
    'package.json',           // Dependencies
    'src/',                   // Source directory
    'lib/handlers/',          // Specific subdirectory
    'data/schema.json'        // Data files
  ],
  restartDelay: 1000
});
```

### Custom Restart Delays

Adjust timing for different server types:

```bash
# Fast restart for simple servers
MCPMON_DELAY=500 mcpmon node server.js

# Slower restart for complex initialization
MCPMON_DELAY=3000 mcpmon python heavy_server.py
```

## Integration Examples

### Claude Desktop Integration

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "/absolute/path/to/server.js"],
      "env": { 
        "API_KEY": "your-key",
        "MCPMON_VERBOSE": "1"
      }
    }
  }
}
```

### MCP Inspector Integration

```bash
# Direct usage
npx @modelcontextprotocol/inspector mcpmon node server.js

# With custom environment
API_KEY=your-key MCPMON_VERBOSE=1 \
  npx @modelcontextprotocol/inspector mcpmon node server.js
```

### Docker Integration

```dockerfile
FROM node:18-alpine

COPY . /app
WORKDIR /app

RUN npm install -g mcpmon

# Set environment for development
ENV MCPMON_VERBOSE=1
ENV MCPMON_DELAY=1000

CMD ["mcpmon", "node", "server.js"]
```

### CI/CD Testing

```bash
# Test without hot-reload in CI
node server.js

# Test with mcpmon but no file watching
MCPMON_WATCH="" mcpmon node server.js
```

## Migration from Legacy mcp-hmr Tool

### Command Changes

| Old (mcp-hmr) | New (mcpmon) |
|---------------|--------------|
| `mcp-hmr --server my-server` | `mcpmon node server.js` |
| `mcp-hmr --list` | Not needed |
| `mcp-hmr --setup my-server` | Not needed |

### Configuration Changes

**Old config file approach:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcp-hmr",
      "args": ["--server", "my-server", "--config", "config.json"]
    }
  }
}
```

**New direct command approach:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "server.js"],
      "env": { "API_KEY": "your-key" }
    }
  }
}
```

### Environment Variables

**Old (mcp-hmr):**
```bash
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=server.js
MCP_WATCH_FILE=server.js
```

**New (mcpmon):**
```bash
# Most settings auto-detected from command
mcpmon node server.js

# Override if needed
MCPMON_WATCH=server.js mcpmon node server.js
```

## See Also

- [Architecture Guide](architecture.md) - How mcpmon works internally
- [Testing Guide](testing.md) - Test architecture and patterns
- [Troubleshooting Guide](../TROUBLESHOOTING.md) - Common issues and solutions