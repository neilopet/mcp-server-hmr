# MCP Server HMR

Hot Module Replacement (HMR) for MCP (Model Context Protocol) servers - instant reloading on file changes, inspired by Vite's developer experience.

## What it does

- 🔄 **Automatic server restart** when your MCP server files change
- 📦 **Message buffering** during restart (no lost messages)
- 🔌 **Transparent connection** management between MCP clients and servers
- 🛠️ **Tool update notifications** to clients (Claude, MCP Inspector, etc.)
- 🌍 **Environment variable** passing to your server
- 📝 **Detailed logging** for debugging

## Quick Start

1. **Clone and setup**:
   ```bash
   git clone https://github.com/neilopet/mcp-server-hmr
   cd mcp-server-hmr
   chmod +x src/main.ts src/config_launcher.ts
   ```

2. **Choose your usage method** (see below)

3. **Connect your MCP client** to the proxy instead of directly to your server.

📚 **New to MCP?** Check out the [Quick Start Example](examples/quickstart.md) for a complete walkthrough!

## Usage Methods

### Method 1: Command Line Arguments (Best for MCP Inspector)

Perfect for one-off usage and MCP Inspector integration:

```bash
# Basic usage
./src/main.ts node /path/to/your/mcp-server.js

# With MCP Inspector
npx @modelcontextprotocol/inspector \
  -e API_KEY="your-key" \
  "./src/main.ts" \
  "node" "/path/to/your/mcp-server.js"

# Python server example
./src/main.ts python -m mcp_server --port 3000

# Deno server example  
./src/main.ts deno run --allow-all server.ts
```

### Method 2: Config File (Best for Multiple Servers)

Ideal for managing multiple MCP servers:

1. Copy `mcpServers.example.json` to `mcpServers.json`
2. Configure your servers:
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
3. Launch with hot-reload:
   ```bash
   # Launch a specific server
   ./src/config_launcher.ts --server my-server

   # List available servers
   ./src/config_launcher.ts --list

   # Use custom config file
   ./src/config_launcher.ts -s my-server -c ~/my-mcp-config.json
   ```

### Method 3: Environment Variables (Simple Single Server)

For simple single-server setups:

1. Copy `.env.example` to `.env`
2. Configure your server:
   ```env
   MCP_SERVER_COMMAND="node"
   MCP_SERVER_ARGS="/path/to/your/mcp-server.js"
   MCP_WATCH_FILE="/path/to/watch.js"  # Optional
   MCP_RESTART_DELAY="300"             # Optional (ms)
   ```
3. Run: `deno task start`

## Configuration Options

- **MCP_SERVER_COMMAND**: Command to run your server (node, deno, python, etc)
- **MCP_SERVER_ARGS**: Arguments for your server command
- **MCP_WATCH_FILE**: (Optional) Specific file to watch, auto-detected if not set
- **MCP_RESTART_DELAY**: (Optional) Debounce delay in ms, default 300
- Add any environment variables your MCP server needs

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

## Available Tasks

Run `deno task <name>` for any of these:

| Task              | Description                                      |
| ----------------- | ------------------------------------------------ |
| `dev`             | Run proxy in development mode with file watching |
| `start`           | Run proxy in production mode                     |
| `build`           | Cache dependencies and type-check the project    |
| `clean`           | Remove generated files and refresh cache         |
| `lint`            | Check code style                                 |
| `format`          | Format code                                      |
| `check`           | Type check the code                              |
| `test`            | Clean, build, then run all tests                 |
| `test:watch`      | Run tests in watch mode (no clean/build)         |
| `test:coverage`   | Clean, build, then generate coverage report      |
| `test:unit`       | Clean, build, then run unit tests only           |
| `test:integration`| Clean, build, then run integration tests only    |
| `test:quick`      | Run tests without clean/build (fast iteration)   |

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
if (message.method === 'initialize') {
  return { protocolVersion: "2024-11-05", capabilities: { tools: {} } };
}

// Tool discovery
if (message.method === 'tools/list') {
  return { tools: [{ name: "test_tool", description: "..." }] };
}

// Tool execution - THIS IS WHAT CHANGES BETWEEN V1 AND V2
if (message.method === 'tools/call' && toolName === 'test_tool') {
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
