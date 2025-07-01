# API Documentation

MCP Hot-Reload provides both programmatic APIs and command-line interfaces for hot-reloading MCP servers during development.

## Table of Contents

- [Command Line Interface](#command-line-interface)
- [Environment Variables](#environment-variables)
- [Programmatic API](#programmatic-api)
- [Events and Logging](#events-and-logging)
- [Error Handling](#error-handling)

## Command Line Interface

### Basic Usage

```bash
# Start with environment variables
deno task start

# Start with explicit configuration
deno run --allow-env --allow-read --allow-run src/main.ts
```

### Configuration Launcher

```bash
# Use configuration file
deno run --allow-env --allow-read --allow-run src/config_launcher.ts config.json
```

Example `config.json`:

```json
{
  "command": "node",
  "args": ["my-server.js"],
  "watchFile": "my-server.js",
  "debounceMs": 2000,
  "logLevel": "info"
}
```

## Environment Variables

### Required Variables

| Variable             | Description                      | Example                     |
| -------------------- | -------------------------------- | --------------------------- |
| `MCP_SERVER_COMMAND` | Command to start MCP server      | `node`, `python`, `deno`    |
| `MCP_SERVER_ARGS`    | Arguments for the server command | `server.js`, `-m my_server` |

### Optional Variables

| Variable                  | Default                       | Description                                     |
| ------------------------- | ----------------------------- | ----------------------------------------------- |
| `MCP_WATCH_FILE`          | Last arg of `MCP_SERVER_ARGS` | File/directory to watch                         |
| `MCP_DEBOUNCE_MS`         | `2000`                        | Debounce delay (milliseconds)                   |
| `MCP_STARTUP_TIMEOUT_MS`  | `30000`                       | Server startup timeout                          |
| `MCP_SHUTDOWN_TIMEOUT_MS` | `10000`                       | Server shutdown timeout                         |
| `MCP_LOG_LEVEL`           | `info`                        | Logging level: `debug`, `info`, `warn`, `error` |

## Programmatic API

### Main Module (`src/mod.ts`)

```typescript
import { createHotReloadProxy } from "@neilopet/mcp-server-hmr";

// Create and start proxy
const proxy = await createHotReloadProxy({
  command: "node",
  args: ["server.js"],
  watchFile: "server.js",
  debounceMs: 2000,
});

// Handle shutdown
process.on("SIGTERM", () => proxy.stop());
```

### Configuration Interface

```typescript
interface McpServerConfig {
  /** Command to execute (e.g., 'node', 'python', 'deno') */
  command: string;

  /** Arguments passed to the command */
  args: string[];

  /** File or directory to watch for changes */
  watchFile?: string;

  /** Debounce delay in milliseconds */
  debounceMs?: number;

  /** Maximum startup time in milliseconds */
  startupTimeoutMs?: number;

  /** Maximum shutdown time in milliseconds */
  shutdownTimeoutMs?: number;

  /** Logging level */
  logLevel?: "debug" | "info" | "warn" | "error";
}
```

### Proxy Methods

```typescript
class HotReloadProxy {
  /** Start the proxy and initial server */
  async start(): Promise<void>;

  /** Stop the proxy and server */
  async stop(): Promise<void>;

  /** Restart the server manually */
  async restart(): Promise<void>;

  /** Get current server status */
  getStatus(): "starting" | "running" | "stopping" | "stopped";

  /** Get server process ID */
  getServerPid(): number | null;
}
```

### Event Listeners

```typescript
proxy.on("server-starting", () => {
  console.log("Server is starting...");
});

proxy.on("server-started", (pid: number) => {
  console.log(`Server started with PID: ${pid}`);
});

proxy.on("server-stopped", (code: number) => {
  console.log(`Server stopped with code: ${code}`);
});

proxy.on("file-change", (path: string) => {
  console.log(`File changed: ${path}`);
});

proxy.on("restart-triggered", (reason: string) => {
  console.log(`Restart triggered: ${reason}`);
});

proxy.on("error", (error: Error) => {
  console.error("Proxy error:", error);
});
```

## Events and Logging

### Log Levels

- **debug**: Detailed debugging information
- **info**: General operational messages (default)
- **warn**: Warning conditions
- **error**: Error conditions

### Log Format

```
[TIMESTAMP] [LEVEL] [COMPONENT] Message
```

Example:

```
[2024-12-01T10:30:45.123Z] [INFO] [Proxy] Server started with PID: 12345
[2024-12-01T10:31:02.456Z] [DEBUG] [FileWatcher] File change detected: server.js
[2024-12-01T10:31:02.789Z] [WARN] [Server] Server took 3.2s to start (slow)
```

### Standard Output vs Error Output

- **stdout**: JSON-RPC messages only (for MCP communication)
- **stderr**: All logging and status messages

## Error Handling

### Common Error Scenarios

1. **Server startup timeout**
   ```
   Error: Server failed to start within 30000ms
   ```

2. **Server command not found**
   ```
   Error: Command 'node' not found in PATH
   ```

3. **Watch file not found**
   ```
   Error: Watch file does not exist: server.js
   ```

4. **Invalid JSON-RPC**
   ```
   Warning: Received invalid JSON-RPC message
   ```

### Error Recovery

The proxy automatically handles many error conditions:

- **Server crashes**: Automatically restarts the server
- **Malformed messages**: Logs warning and continues
- **File watch errors**: Attempts to re-establish file watching
- **Process cleanup**: Ensures proper cleanup on shutdown

### Exit Codes

| Code | Meaning                |
| ---- | ---------------------- |
| 0    | Normal shutdown        |
| 1    | Configuration error    |
| 2    | Server startup failure |
| 3    | File watching failure  |
| 130  | Interrupted (Ctrl+C)   |

## Advanced Usage

### Custom Server Implementations

For servers that need special handling:

```typescript
import { McpServerProcess } from "@neilopet/mcp-server-hmr";

class CustomServer extends McpServerProcess {
  protected async startServer(): Promise<void> {
    // Custom startup logic
    await super.startServer();
    // Post-startup initialization
  }

  protected async stopServer(): Promise<void> {
    // Custom cleanup logic
    await super.stopServer();
  }
}
```

### Multiple File Watching

Watch multiple files or directories:

```bash
MCP_WATCH_FILE="src/,config/settings.json,package.json"
```

### Development vs Production

Development configuration:

```bash
MCP_DEBOUNCE_MS=500
MCP_LOG_LEVEL=debug
```

Production configuration:

```bash
MCP_DEBOUNCE_MS=5000
MCP_LOG_LEVEL=error
```

## Integration Examples

### Claude Desktop Integration

```json
{
  "mcpServers": {
    "my-dev-server": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-read",
        "--allow-run",
        "/path/to/claude-live-reload/src/main.ts"
      ],
      "env": {
        "MCP_SERVER_COMMAND": "node",
        "MCP_SERVER_ARGS": "/path/to/my-server.js",
        "MCP_WATCH_FILE": "/path/to/my-server.js",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Docker Integration

```dockerfile
FROM denoland/deno:alpine

COPY . /app
WORKDIR /app

ENV MCP_SERVER_COMMAND=node
ENV MCP_SERVER_ARGS=server.js
ENV MCP_WATCH_FILE=server.js

CMD ["deno", "task", "start"]
```

### CI/CD Testing

```bash
# Test configuration without starting
deno run --allow-env --allow-read src/config_launcher.ts --validate-only config.json

# Test server startup without hot-reload
MCP_DEBOUNCE_MS=0 deno task start
```
