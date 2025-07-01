# MCP Hot-Reload

[![Deno](https://img.shields.io/badge/deno-1.40+-black?logo=deno&logoColor=white)](https://deno.land/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./tests/)
[![Code Style](https://img.shields.io/badge/code%20style-deno%20fmt-blue.svg)](https://deno.land/manual/tools/formatter)

A development proxy for MCP (Model Context Protocol) servers that enables hot-reload functionality. Make changes to your MCP server code and see them instantly without restarting your MCP client.

## What it is

MCP Hot-Reload is a **transparent proxy** that sits between your MCP client (Claude Desktop, MCP Inspector, etc.) and your MCP server. Once configured, you can modify your server code and the changes take effect immediately - no more restarting Claude Desktop or other clients after every code change.

**Key benefits:**
- **Non-disruptive development** - Your MCP client stays connected while your server reloads
- **Zero message loss** - Requests are buffered during server restart
- **One-time setup** - Configure once, develop freely
- **Universal compatibility** - Works with any MCP server (Node.js, Python, Deno, etc.)

## Quick Start

1. **Clone and set up the repository**:
   ```bash
   git clone https://github.com/neilopet/mcp-server-hmr
   cd mcp-server-hmr
   deno task setup
   ```
   
   The setup command will display the full path to the proxy executable, which you'll need for step 3.

2. **Configure automatic hot-reload for your MCP server**:
   ```bash
   # If you have servers in Claude Desktop config:
   watch --setup my-server
   
   # Or set up all stdio servers at once:
   watch --setup --all
   ```
   
   This modifies your MCP client configuration to use the hot-reload proxy.

3. **Restart your MCP client** (Claude Desktop, etc.) to load the new configuration.

That's it! Your MCP server now has hot-reload enabled. Edit your server code and changes apply instantly.

**New to MCP?** Check out the [Quick Start Example](examples/quickstart.md) for a complete walkthrough.

## Usage Examples

### Direct Command Line Usage

Run your MCP server through the hot-reload proxy:

```bash
# Node.js server
watch node /path/to/your/mcp-server.js

# Python server
watch python -m mcp_server

# Deno server
watch deno run --allow-all server.ts

# With environment variables
watch -e API_KEY="your-key" node server.js

# Use with MCP Inspector
npx @modelcontextprotocol/inspector \
  "watch" \
  "node" "/path/to/your/mcp-server.js"
```

### Automatic Configuration Mode

Ideal for managing multiple MCP servers. The config launcher automatically searches for configs in this order:

1. **Claude Code project config** (`.mcp.json` in current directory)
2. **Claude Desktop config** (platform-specific):
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
3. **Current directory** (`./mcpServers.json`)

#### Basic Usage

```bash
# Launch a server from any found config
watch --server my-server

# List all available servers
watch --list

# Use a specific config file
watch -s my-server -c ~/my-config.json

# Auto-configure servers for hot-reload
watch --setup my-server     # Setup specific server
watch --all                 # Setup all stdio servers
```

#### Auto-Setup Feature

The `--setup` command automatically configures your MCP servers to use hot-reload:

1. **Creates a backup** of your original config
2. **Preserves original server** with `-original` suffix
3. **Replaces active server** with hot-reload wrapped version
4. **Filters out HTTP/SSE servers** (only stdio servers supported)

Example transformation:

```json
// Before setup
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": { "API_KEY": "key" }
    }
  }
}

// After setup
{
  "mcpServers": {
    "my-server": {
      "command": "/path/to/mcp-server-hmr/src/main.ts",
      "args": ["node", "dist/index.js"],
      "env": { "API_KEY": "key" }
    },
    "my-server-original": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": { "API_KEY": "key" }
    }
  }
}
```

#### Config File Format

All config files use the same format:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/project",
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

### Environment Variable Mode

For single-server setups without modifying client configs:

1. Copy `.env.example` to `.env`
2. Configure your server:
   ```env
   MCP_SERVER_COMMAND="node"
   MCP_SERVER_ARGS="/path/to/your/mcp-server.js"
   MCP_WATCH_FILE="/path/to/watch.js"  # Optional, auto-detected if not set
   MCP_RESTART_DELAY="300"             # Optional, milliseconds
   ```
3. Run: `deno task start`

## How It Works

MCP Hot-Reload acts as a transparent proxy between your MCP client and server:

```
MCP Client → Hot-Reload Proxy → Your MCP Server
(Claude)         (watches)         (reloads)
```

1. **File Watching**: Monitors your server files for changes
2. **Smart Restart**: Cleanly shuts down and restarts your server
3. **Message Buffering**: Queues incoming requests during restart
4. **Seamless Handoff**: Replays buffered messages to the new server
5. **Client Transparency**: Client stays connected throughout

## Usage with Claude Desktop

Edit your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

**Option 1: Using Config File (Recommended)**

```json
{
  "mcpServers": {
    "my-server-hmr": {
      "command": "/path/to/mcp-server-hmr/src/config_launcher.ts",
      "args": ["--server", "my-server", "--config", "/path/to/mcpServers.json"]
    }
  }
}
```

**Option 2: Using Command Line Mode**

```json
{
  "mcpServers": {
    "my-server-hmr": {
      "command": "/path/to/mcp-server-hmr/src/main.ts",
      "args": ["node", "/path/to/your/mcp-server.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

**Option 3: Using Environment Variables**

```json
{
  "mcpServers": {
    "your-server": {
      "command": "deno",
      "args": ["task", "start"],
      "cwd": "/path/to/mcp-server-hmr",
      "env": {
        "MCP_SERVER_COMMAND": "node",
        "MCP_SERVER_ARGS": "/path/to/your/server.js"
      }
    }
  }
}
```

## Usage with MCP Inspector

Create a config file for MCP Inspector:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "/path/to/mcp-server-hmr/src/main.ts",
      "args": [],
      "env": {
        "MCP_SERVER_COMMAND": "node",
        "MCP_SERVER_ARGS": "/path/to/your/server.js"
      }
    }
  }
}
```

Then run: `npx @modelcontextprotocol/inspector --config config.json --server your-server`

## Installation Options

### Global Command Setup

After cloning, run the setup task to add `watch` to your PATH:

```bash
deno task setup
source ~/.bashrc  # or ~/.zshrc, ~/.bash_profile
```

This allows you to use `watch` from anywhere:

```bash
watch --help
watch --list
watch --server my-server
```

### Manual Setup

If you prefer not to modify your PATH, you can always use the full paths:

```bash
./src/main.ts                 # Direct hot-reload proxy
./src/config_launcher.ts      # Config-based launcher
./watch                       # Wrapper script
```

## Available Tasks

Run `deno task <name>` for any of these:

| Task               | Description                                      |
| ------------------ | ------------------------------------------------ |
| `setup`            | **Add 'watch' command to your PATH**             |
| `dev`              | Run proxy in development mode with file watching |
| `start`            | Run proxy in production mode                     |
| `build`            | Cache dependencies and type-check the project    |
| `clean`            | Remove generated files and refresh cache         |
| `lint`             | Check code style                                 |
| `format`           | Format code                                      |
| `check`            | Type check the code                              |
| `test`             | Clean, build, then run all tests                 |
| `test:watch`       | Run tests in watch mode (no clean/build)         |
| `test:coverage`    | Clean, build, then generate coverage report      |
| `test:unit`        | Clean, build, then run unit tests only           |
| `test:integration` | Clean, build, then run integration tests only    |
| `test:quick`       | Run tests without clean/build (fast iteration)   |

## Requirements

- [Deno](https://deno.land/) 1.30 or higher
- macOS, Linux, or Windows

## How It Works

```
MCP Client → MCP Server HMR → Your MCP Server
(Claude)         ↓                     ↓
              Watches files      Restarts on changes
                    ↓                     ↓
              Buffers requests   Sends tool updates
```

1. **File Watching**: Monitors your server file for changes
2. **Process Management**: Cleanly restarts your server when files change
3. **Message Buffering**: Queues client messages during restart
4. **Tool Discovery**: Fetches updated tool list after restart
5. **Notifications**: Tells clients about tool changes via MCP protocol

## Logging and Debugging

The proxy provides detailed logging to help troubleshoot issues:

### Log Output

All logs are written to **stderr** (not stdout) to avoid interfering with MCP protocol messages:

```bash
# View logs in real-time
deno task dev 2>&1 | tee mcp-hmr.log

# Save logs to file
deno task start 2>debug.log

# View logs with timestamps
deno task dev 2>&1 | ts '[%Y-%m-%d %H:%M:%S]'
```

### Log Messages

The proxy logs important events with emoji prefixes for easy scanning:

- 🚀 **Startup**: "Starting MCP Server HMR"
- 📟 **Server info**: Shows command and arguments
- 👀 **Watching**: Shows which file is being watched
- 📝 **File changes**: "File modify: /path/to/file"
- 🔄 **Restart**: "File change detected, restarting server..."
- 🛑 **Shutdown**: "Killing server process..."
- ✅ **Success**: Process started, tools found, etc.
- ❌ **Errors**: Failed operations with details
- 📋 **Protocol**: Initialize params captured
- 📦 **Buffering**: Messages buffered during restart
- 📢 **Notifications**: Tool change notifications sent

### Debugging Tips

1. **Server won't start**: Check the error logs for missing env vars or invalid paths
2. **No hot reload**: Verify the watched file path is correct (check the 👀 log)
3. **Lost messages**: Look for 📦 buffering logs during restarts
4. **Tool updates not working**: Check for 📢 notification logs
5. **Process issues**: Look for 🛑 and zombie process warnings

### Environment Variables for Debugging

```env
# Enable verbose logging (future feature)
MCP_LOG_LEVEL=debug

# Increase restart delay if your server needs more time
MCP_RESTART_DELAY=1000
```

## Testing

The project includes a comprehensive test suite that validates the actual hot-reload proxy functionality:

```bash
# Run all tests
deno task test

# Run tests in watch mode during development
deno task test:watch

# Generate coverage report
deno task test:coverage

# Run specific test suites
deno task test:unit        # Core functionality tests
deno task test:integration # E2E and complex scenario tests
```

### Test Architecture

The test suite is built using the **Model Context Protocol (MCP) Client and Server SDK** from `@modelcontextprotocol/typescript-sdk`. This ensures we test the actual hot-reload functionality, not just Deno APIs.

#### MCP Test Components

**MCP Server Examples Used:**

- **Simple Stdio Server Pattern**: Based on the stdio transport examples from the MCP TypeScript SDK
- **Built as JavaScript**: All test fixtures are pre-built JavaScript files committed to the codebase
- **Minimal Implementation**: Focus on essential MCP protocol methods (initialize, tools/list, tools/call)

**Test Fixtures:**

- `tests/fixtures/mcp_server_v1.js` - Returns "Result A" from test_tool
- `tests/fixtures/mcp_server_v2.js` - Returns "Result B" from test_tool
- `tests/fixtures/mcp_client.js` - MCP client for end-to-end testing

#### Test Categories

**Unit Tests** (`deno task test:unit`):

- `file_change_detection_test.ts` - Verifies file watching triggers server restart
- `restart_sequence_test.ts` - Validates correct restart order (detect → kill → start → buffer → notify)
- `message_buffering_test.ts` - Tests message queuing and replay during restart

**Integration Tests** (`deno task test:integration`):

- `e2e_reload_test.ts` - Full end-to-end reload functionality test
- `error_handling_test.ts` - Server startup failures and crash recovery
- `debouncing_test.ts` - Multiple rapid file changes trigger only one restart

### E2E Test Detailed Explanation

The **`e2e_reload_test.ts`** is the most important test as it validates the core value proposition of the hot-reload proxy:

#### How the E2E Test Works

1. **Setup Phase**:
   - Starts the hot-reload proxy with `mcp_server_v1.js` (returns "Result A")
   - Creates an MCP client that connects through the proxy
   - Initializes the MCP connection and verifies initial state

2. **Initial State Verification**:
   ```typescript
   const initialResult = await client.callTool("test_tool", { input: "test" });
   assertEquals(initialResult.content[0].text, "Result A");
   ```

3. **Trigger Reload**:
   - Swaps the server file content from v1 to v2 (changes result from "Result A" to "Result B")
   - File change triggers the hot-reload sequence
   - Proxy detects change, kills old server, starts new server, buffers messages

4. **Post-Reload Verification**:
   ```typescript
   const reloadedResult = await client.callTool("test_tool", { input: "test" });
   assertEquals(reloadedResult.content[0].text, "Result B");
   ```

5. **Restore and Final Verification**:
   - Restores original v1 content
   - Verifies result returns to "Result A"
   - Ensures tools remain available throughout the process

#### What the E2E Test Validates

- **File Change Detection**: Hot-reload proxy detects when server files are modified
- **Transparent Restart**: Client connection remains active during server restart
- **Message Buffering**: No lost messages during the restart process
- **Tool Result Changes**: Actual functionality changes are picked up after reload
- **Connection Persistence**: MCP client can continue making requests after reload
- **Bidirectional Functionality**: Can reload back and forth between different server versions

This test proves the hot-reload proxy delivers on its core promise: **instant reloading with transparent connection management and no lost functionality**.

### MCP Protocol Implementation

The test servers implement the essential MCP protocol methods:

```javascript
// Initialize handshake
if (message.method === "initialize") {
  return { protocolVersion: "2024-11-05", capabilities: { tools: {} } };
}

// Tool discovery
if (message.method === "tools/list") {
  return { tools: [{ name: "test_tool", description: "..." }] };
}

// Tool execution - THIS IS WHAT CHANGES BETWEEN V1 AND V2
if (message.method === "tools/call" && toolName === "test_tool") {
  return { content: [{ type: "text", text: "Result A" }] }; // or "Result B"
}
```

This minimal implementation focuses on the functionality that matters for hot-reload testing while staying true to the MCP protocol specification.

## Troubleshooting

Having issues? Check the [Troubleshooting Guide](TROUBLESHOOTING.md) for solutions to common problems.

## Security

This tool requires several Deno permissions:

- `--allow-env`: Read environment variables for configuration
- `--allow-read`: Read files to watch for changes
- `--allow-run`: Execute your MCP server process
- `--allow-net`: Forward network connections (if your server uses them)

These permissions are defined in `deno.jsonc` and are necessary for the proxy to function.

---

### For AI Assistants

This is a **Deno project**. Do not use Node.js, npm, or yarn commands.

- **Configuration**: All tasks and dependencies are in `deno.jsonc`
- **Run the project**: `deno task dev`
- **Run tests**: `deno task test`
- **Format code**: `deno task format`
- **Entry point**: `src/main.ts`
- **Environment**: Copy `.env.example` to `.env` and configure

**Dependencies**: Managed via import maps in `deno.jsonc`. No `package.json` or `node_modules`.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `deno task format` and `deno task lint`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
