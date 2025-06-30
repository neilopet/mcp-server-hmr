# MCP Hot-Reload Proxy

A development tool that enables hot-reloading for MCP (Model Context Protocol) servers, providing a Vite-like HMR experience for AI tool development.

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
   git clone <this-repo>
   cd mcp-hot-reload-proxy
   cp .env.example .env
   ```

2. **Configure your MCP server**:
   Edit `.env` and set your server command and path:
   ```env
   MCP_SERVER_COMMAND="node"
   MCP_SERVER_ARGS="/path/to/your/mcp-server.js"
   ```

3. **Run the proxy**:
   ```bash
   deno task dev
   ```

4. **Connect your MCP client** to the proxy instead of directly to your server.

## Configuration

All configuration is done via environment variables in your `.env` file. Copy `.env.example` to `.env` and customize:

- `MCP_SERVER_COMMAND`: The command to run your server (e.g., "node", "deno", "python")
- `MCP_SERVER_ARGS`: Arguments to pass to the command (typically the path to your server)
- Add any environment variables your MCP server needs

## Usage with Claude Desktop

Edit your Claude Desktop configuration to use the proxy:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "deno",
      "args": ["task", "start"],
      "cwd": "/path/to/mcp-hot-reload-proxy",
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
      "command": "/path/to/mcp-hot-reload-proxy/src/main.ts",
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

| Task | Description |
|------|-------------|
| `dev` | Run proxy in development mode with file watching |
| `start` | Run proxy in production mode |
| `lint` | Check code style |
| `format` | Format code |
| `check` | Type check the code |
| `test` | Run tests |

## How It Works

```
MCP Client → Hot-Reload Proxy → Your MCP Server
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