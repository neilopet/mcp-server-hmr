# MCP Hot-Reload

[![Node.js](https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./tests/)
[![Code Style](https://img.shields.io/badge/code%20style-prettier-blue.svg)](https://prettier.io/)

A development proxy for MCP (Model Context Protocol) servers that enables hot-reload functionality. Make changes to your MCP server code and see them instantly without restarting your MCP client.

## What it is

MCP Hot-Reload is a **transparent proxy** that sits between your MCP client (Claude Desktop, MCP Inspector, etc.) and your MCP server. Once configured, you can modify your server code and the changes take effect immediately - no more restarting Claude Desktop or other clients after every code change.

**Key benefits:**

- **Non-disruptive development** - Your MCP client stays connected while your server reloads
- **Zero message loss** - Requests are buffered during server restart
- **One-time setup** - Configure once, develop freely
- **Universal compatibility** - Works with any MCP server (Node.js, Python, Deno, etc.)

## Quick Start

1. **Install globally**:
   ```bash
   npm install -g mcp-server-hmr
   ```

   This installs the `mcp-hmr` and `mcp-watch` commands globally on your system.

2. **Configure automatic hot-reload for your MCP server**:
   ```bash
   # If you have servers in Claude Desktop config:
   mcp-hmr --setup my-server

   # Or set up all stdio servers at once:
   mcp-hmr --setup --all
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
mcp-hmr node /path/to/your/mcp-server.js

# Python server
mcp-hmr python -m mcp_server

# Deno server
mcp-hmr deno run --allow-all server.ts

# With environment variables
mcp-hmr -e API_KEY="your-key" node server.js

# Use with MCP Inspector
npx @modelcontextprotocol/inspector \
  "mcp-hmr" \
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
mcp-hmr --server my-server

# List all available servers
mcp-hmr --list

# Use a specific config file
mcp-hmr -s my-server -c ~/my-config.json

# Auto-configure servers for hot-reload
mcp-hmr --setup my-server     # Setup specific server
mcp-hmr --setup --all         # Setup all stdio servers
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
      "command": "mcp-hmr",
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
3. Run: `npm start`

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

### Architecture

The hot-reload proxy uses **dependency injection** for improved testability and cross-platform compatibility:

- **Platform-agnostic interfaces**: `ProcessManager` and `FileSystem` abstract platform-specific operations
- **Node.js implementations**: `NodeProcessManager` and `NodeFileSystem` provide Node.js runtime support
- **Mock implementations**: Enable comprehensive behavioral testing without external dependencies
- **I/O stream abstraction**: Handles stdin/stdout/stderr through configurable streams
- **Process lifecycle management**: Configurable timing for graceful shutdowns and startup delays

## Usage with Claude Desktop

Edit your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

**Option 1: Using Config File (Recommended)**

```json
{
  "mcpServers": {
    "my-server-hmr": {
      "command": "mcp-hmr",
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
      "command": "mcp-hmr",
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
      "command": "mcp-hmr",
      "args": [],
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
      "command": "mcp-hmr",
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

After installing globally with npm, the commands are automatically available:

```bash
npm install -g mcp-server-hmr
```

This allows you to use `mcp-hmr` and `mcp-watch` from anywhere:

```bash
mcp-hmr --help
mcp-hmr --list
mcp-hmr --server my-server
```

### Development Setup

For development, you can clone the repository and use npm link:

```bash
git clone https://github.com/neilopet/mcp-server-hmr
cd mcp-server-hmr
npm install
npm run build
npm link
```

## Available Scripts

Run `npm run <name>` for any of these:

| Script             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `start`            | Run proxy in production mode                     |
| `dev`              | Run proxy in development mode with file watching |
| `build`            | Compile TypeScript to JavaScript                |
| `clean`            | Remove generated files                           |
| `lint`             | Check code style with ESLint                    |
| `format`           | Format code with Prettier                       |
| `typecheck`        | Type check the code with TypeScript             |
| `test`             | Build then run all tests                        |
| `test:watch`       | Run tests in watch mode                         |
| `test:coverage`    | Generate coverage report                         |
| `test:unit`        | Run unit tests only                             |
| `test:integration` | Run integration tests only                      |

## Requirements

- [Node.js](https://nodejs.org/) 18 or higher
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
npm run dev 2>&1 | tee mcp-hmr.log

# Save logs to file
npm start 2>debug.log

# View logs with timestamps
npm run dev 2>&1 | ts '[%Y-%m-%d %H:%M:%S]'
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

The project includes a comprehensive test suite with both behavioral and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test suites
npm run test:unit        # Core functionality tests
npm run test:integration # E2E and complex scenario tests
```

### Test Architecture

The test suite uses **dependency injection with mock implementations** for reliable, fast behavioral testing alongside integration tests with real MCP communication. Tests achieve ~80% code reduction through the `test_helper.ts` pattern.

📖 **[Full Testing Documentation →](docs/testing.md)**

Key features:

- Platform-agnostic behavioral tests using interfaces
- Deterministic timing without setTimeout patterns
- Comprehensive mock implementations
- Real MCP protocol integration tests
- 80% coverage on core logic

## Troubleshooting

Having issues? Check the [Troubleshooting Guide](TROUBLESHOOTING.md) for solutions to common problems.

## Security

This tool requires standard Node.js permissions:

- **File system access**: Read files to watch for changes
- **Process execution**: Execute your MCP server process
- **Environment variables**: Read configuration from environment
- **Network access**: Forward network connections (if your server uses them)

These are standard Node.js capabilities and don't require special permission flags.

---

### For AI Assistants

This is a **Node.js project**. Use npm commands.

- **Configuration**: Dependencies and scripts are in `package.json`
- **Run the project**: `npm run dev`
- **Run tests**: `npm test`
- **Format code**: `npm run format`
- **Entry point**: `dist/cli.js` (compiled from `src/cli.ts`)
- **Environment**: Copy `.env.example` to `.env` and configure

**Dependencies**: Managed via npm in `package.json` with `node_modules`.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run format` and `npm run lint`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
