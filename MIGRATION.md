# Migration Guide: Extension-Based Architecture

This guide helps you migrate from the current mcpmon structure to the new extension-based architecture. The migration provides better modularity, configurability, and extensibility while maintaining backward compatibility.

## Overview

The extension system introduces:
- **Modular functionality** - Features are isolated in extensions
- **Hook-based architecture** - Extensions can intercept and modify message flow
- **Tool injection** - Extensions can add new MCP tools
- **Configuration per extension** - Fine-grained control over extension behavior
- **Easy enabling/disabling** - Turn features on/off without code changes

## Migration Steps

### Step 1: Update mcpmon

Ensure you're using the latest version with extension support:

```bash
# Update to latest version
npm update -g mcpmon

# Verify extension support
mcpmon --list-extensions
```

### Step 2: Identify Current Features to Migrate

Current mcpmon provides these features that are now available as extensions:

| Current Feature | Extension | Migration Action |
|----------------|-----------|------------------|
| Basic proxy functionality | Core (always enabled) | No action needed |
| Message buffering | Core (always enabled) | No action needed |
| Hot-reload on file changes | Core (always enabled) | No action needed |
| Large response handling | `large-response-handler` | Enable extension |
| Request/response logging | `request-logger` | Enable extension |
| Performance metrics | `metrics` | Enable extension |

### Step 3: Enable Required Extensions

#### For Development with Large Data

If you work with MCP servers that return large datasets:

```bash
# Before (if you had custom large response handling)
mcpmon node server.js

# After (with built-in large response handling)
mcpmon --enable-extension large-response-handler node server.js
```

#### For Request/Response Monitoring

If you need detailed logging of MCP protocol messages:

```bash
# Before (no built-in logging)
MCPMON_VERBOSE=1 mcpmon node server.js

# After (with structured request logging)
mcpmon --enable-extension request-logger node server.js
```

#### For Production Monitoring

If you need metrics and monitoring:

```bash
# Before (no metrics)
mcpmon node server.js

# After (with metrics collection)
mcpmon --enable-extension metrics \
       --extensions-data-dir /var/log/mcpmon \
       node server.js
```

### Step 4: Configure Extensions

Extensions support JSON configuration for fine-tuning:

```bash
# Configure large response handler threshold
mcpmon --enable-extension large-response-handler \
       --extension-config '{"threshold":20000,"format":"duckdb"}' \
       node server.js

# Configure request logger detail level
mcpmon --enable-extension request-logger \
       --extension-config '{"logLevel":"debug","includeHeaders":true}' \
       node server.js

# Multiple extensions with shared config
mcpmon --enable-extension large-response-handler \
       --enable-extension request-logger \
       --extensions-data-dir ./monitoring-data \
       --extension-config '{"threshold":15000,"logLevel":"info"}' \
       node server.js
```

### Step 5: Update Claude Desktop/Code Configuration

If using mcpmon with Claude Desktop or Claude Code, update your configuration to include extension flags:

#### Before (Basic mcpmon)
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "server.js"]
    }
  }
}
```

#### After (With Extensions)
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": [
        "--enable-extension", "large-response-handler",
        "--extensions-data-dir", "./data",
        "--extension-config", "{\"threshold\":25000}",
        "node", "server.js"
      ]
    }
  }
}
```

### Step 6: Migrate Custom Functionality

If you have custom mcpmon modifications, migrate them to extensions:

#### Creating a Custom Extension

1. **Create extension directory:**
   ```bash
   mkdir -p src/extensions/my-custom-extension
   ```

2. **Implement extension interface:**
   ```typescript
   // src/extensions/my-custom-extension/index.ts
   import type { Extension, ExtensionContext } from '../interfaces.js';

   export class MyCustomExtension implements Extension {
     readonly id = 'my-custom-extension';
     readonly name = 'My Custom Extension';
     readonly version = '1.0.0';
     readonly defaultEnabled = false;

     async initialize(context: ExtensionContext): Promise<void> {
       // Migrate your custom logic here
       context.hooks.beforeStdinForward = this.interceptRequest.bind(this);
       context.hooks.afterStdoutReceive = this.processResponse.bind(this);
     }

     async shutdown(): Promise<void> {
       // Cleanup resources
     }

     private async interceptRequest(message: any): Promise<any> {
       // Your custom request processing
       return message;
     }

     private async processResponse(message: any): Promise<any> {
       // Your custom response processing
       return message;
     }
   }

   export default new MyCustomExtension();
   ```

3. **Register and use extension:**
   ```bash
   mcpmon --enable-extension my-custom-extension node server.js
   ```

## Migration Examples

### Example 1: Development Environment

**Before:**
```bash
MCPMON_VERBOSE=1 mcpmon node server.js
```

**After:**
```bash
mcpmon --enable-extension request-logger \
       --enable-extension large-response-handler \
       --extension-config '{"logLevel":"debug","threshold":10000}' \
       node server.js
```

**Benefits:**
- Structured logging instead of verbose output
- Automatic large response handling
- Configurable thresholds
- Data persistence for analysis

### Example 2: Production Environment

**Before:**
```bash
mcpmon node server.js
```

**After:**
```bash
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       --extensions-data-dir /var/log/mcpmon \
       --extension-config '{"metricsPort":9090,"threshold":50000}' \
       node server.js
```

**Benefits:**
- Metrics collection for monitoring
- Large response handling for stability
- Centralized data storage
- Configurable behavior

### Example 3: Testing Environment

**Before:**
```bash
mcpmon --delay 500 node test-server.js
```

**After:**
```bash
mcpmon --delay 500 \
       --enable-extension request-logger \
       --extension-config '{"logLevel":"trace","saveToFile":true}' \
       node test-server.js
```

**Benefits:**
- Detailed request/response logging for debugging
- Persistent logs for test analysis
- Faster iteration with detailed feedback

## Backward Compatibility

The extension system maintains full backward compatibility:

- **All existing CLI flags work** - `--delay`, `--watch`, `--verbose`
- **All environment variables work** - `MCPMON_DELAY`, `MCPMON_WATCH`, `MCPMON_VERBOSE`
- **No breaking changes** - Existing mcpmon commands continue to work
- **Gradual adoption** - Enable extensions as needed

## Extension Configuration Reference

### Large Response Handler

```json
{
  "threshold": 25000,          // Response size threshold (bytes)
  "format": "duckdb",          // Storage format: "duckdb" | "json" | "parquet"
  "compression": true,         // Enable compression
  "schemaGeneration": true,    // Generate JSON schemas
  "retentionDays": 7          // Auto-cleanup after N days
}
```

### Request Logger

```json
{
  "logLevel": "info",          // "trace" | "debug" | "info" | "warn" | "error"
  "includeHeaders": true,      // Log message headers
  "includeBody": true,         // Log message body
  "saveToFile": true,          // Persist logs to disk
  "maxFileSize": "10MB",       // Log rotation size
  "maxFiles": 5               // Keep N log files
}
```

### Metrics

```json
{
  "metricsPort": 9090,         // Prometheus metrics port
  "collectInterval": 5000,     // Collection interval (ms)
  "histogramBuckets": [        // Custom histogram buckets
    0.1, 0.5, 1, 2, 5, 10
  ],
  "enabledMetrics": [          // Which metrics to collect
    "request_duration",
    "request_count",
    "error_rate"
  ]
}
```

## Troubleshooting

### Extension Not Loading

```bash
# Check available extensions
mcpmon --list-extensions

# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon --enable-extension my-extension node server.js
```

### Configuration Errors

```bash
# Validate JSON configuration
echo '{"threshold":25000}' | python -m json.tool

# Test extension configuration
mcpmon --enable-extension large-response-handler \
       --extension-config '{"threshold":10000}' \
       --list-extensions
```

### Performance Issues

```bash
# Disable resource-intensive extensions
mcpmon --disable-extension metrics node server.js

# Reduce logging verbosity
mcpmon --enable-extension request-logger \
       --extension-config '{"logLevel":"warn"}' \
       node server.js
```

## Getting Help

- **List extensions:** `mcpmon --list-extensions`
- **Verbose output:** `MCPMON_VERBOSE=1 mcpmon ...`
- **Documentation:** See extension README files in `src/extensions/`
- **Issues:** Report problems at https://github.com/anthropics/mcpmon/issues

## Next Steps

1. **Start with basic extensions** - Enable `large-response-handler` for development
2. **Add monitoring gradually** - Enable `request-logger` when debugging
3. **Create custom extensions** - For project-specific functionality
4. **Share extensions** - Contribute useful extensions back to the community

The extension system provides a path for mcpmon to grow with your needs while maintaining simplicity for basic use cases.