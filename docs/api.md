# API Documentation

mcpmon provides both command-line interfaces and programmatic APIs for hot-reloading MCP servers during development.

## Table of Contents

- [Command Line Interface](#command-line-interface)
- [Environment Variables](#environment-variables)
- [Programmatic API](#programmatic-api)
- [Events and Logging](#events-and-logging)
- [Error Handling](#error-handling)

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

### Main Module

```typescript
import { createMCPProxy } from "mcpmon";

// Create and start proxy
const proxy = await createMCPProxy({
  command: "node",
  args: ["server.js"],
  watchFile: "server.js", // Optional - auto-detected if not specified
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

```typescript
interface MCPProxyConfig {
  /** Command to execute (e.g., 'node', 'python', 'deno') */
  command: string;

  /** Arguments passed to the command */
  commandArgs: string[];

  /** @deprecated Use watchTargets instead. Single file/directory to watch */
  entryFile?: string | null;

  /** Array of files, directories, packages, or other resources to monitor */
  watchTargets?: string[];

  /** Restart delay in milliseconds */
  restartDelay?: number;

  /** Environment variables to pass to server */
  env?: Record<string, string>;

  /** Maximum time to wait for graceful shutdown */
  killDelay?: number;

  /** Delay after server starts before considering it ready */
  readyDelay?: number;
}
```

### Proxy Methods

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

### Helper Function

```typescript
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchFile: 'server.js', // Single file to watch (auto-detected if not specified)
  restartDelay: 1000,
  env: { API_KEY: 'your-key' },
  killDelay: 1000,
  readyDelay: 2000,
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

## Library Usage

### Using mcpmon as a Library

mcpmon can be imported and used as a library in your Node.js applications:

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
  commandArgs: ['server.js'],
  entryFile: 'server.js',
  restartDelay: 1000
});

// Or use the helper function for simpler setup
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchFile: 'server.js',
  restartDelay: 1000,
  env: { API_KEY: 'your-key' }
});
```

## Advanced Usage

### File Detection

mcpmon automatically detects which files to watch:

1. Looks for the first script file in your arguments (`.js`, `.mjs`, `.ts`, `.py`, `.rb`, `.php`)
2. Falls back to current directory if no script file found
3. Can be overridden with `MCPMON_WATCH` environment variable

### Multiple File Monitoring

Watch multiple files or directories:

```bash
# Multiple files
MCPMON_WATCH="server.js,config.json,package.json" mcpmon node server.js

# Directories and files
MCPMON_WATCH="src/,config/settings.json,package.json" mcpmon node server.js
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

## Migration from mcp-hmr

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