# mcpmon

[![Node.js](https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./tests/)
[![Code Style](https://img.shields.io/badge/code%20style-prettier-blue.svg)](https://prettier.io/)

**Hot-reload monitor for MCP servers - like nodemon but for Model Context Protocol**

Make changes to your MCP server code and see them instantly without restarting your MCP client. Just like nodemon automatically restarts Node.js applications, mcpmon automatically restarts MCP servers.

## What it is

mcpmon is a **transparent proxy** that sits between your MCP client (Claude Desktop, MCP Inspector, etc.) and your MCP server. When you modify your server code, mcpmon automatically restarts the server while keeping your client connected.

**Key benefits:**

- **Like nodemon, but for MCP** - Simple command-line interface you already know
- **Zero configuration** - Just wrap your server command with mcpmon
- **Non-disruptive development** - Your MCP client stays connected while your server reloads
- **Zero message loss** - Requests are buffered during server restart
- **Universal compatibility** - Works with any MCP server (Node.js, Python, Deno, etc.)

## Quick Start

1. **Install globally**:
   ```bash
   npm install -g mcpmon
   ```

2. **Use with your MCP server**:
   ```bash
   # Instead of: node server.js
   mcpmon node server.js

   # Instead of: python server.py  
   mcpmon python server.py

   # Instead of: deno run --allow-all server.ts
   mcpmon deno run --allow-all server.ts
   ```

3. **Use with MCP clients**:
   ```bash
   # MCP Inspector
   npx @modelcontextprotocol/inspector mcpmon node server.js

   # Or in Claude Desktop config:
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

That's it! Your MCP server now has hot-reload enabled. Edit your server code and changes apply instantly.

## Usage Examples

### Basic Usage

```bash
# Node.js server
mcpmon node server.js

# Python server
mcpmon python -m mcp_server

# Python with args
mcpmon python server.py --port 3000

# Deno server
mcpmon deno run --allow-all server.ts

# With debugging
mcpmon node --inspect server.js
```

### With MCP Inspector

```bash
# Direct command
npx @modelcontextprotocol/inspector mcpmon node server.js

# With environment variables
API_KEY=your-key npx @modelcontextprotocol/inspector mcpmon node server.js
```

### With Claude Desktop

Update your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "server.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

## Configuration

mcpmon works out of the box with zero configuration. It automatically detects what file to watch based on your command arguments.

### Environment Variables

Customize behavior with environment variables:

```bash
# Override which files to watch (comma-separated)
MCPMON_WATCH="server.js,config.json" mcpmon node server.js

# Change restart delay (default: 1000ms)
MCPMON_DELAY=500 mcpmon node server.js

# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon node server.js
```

### Watch File Detection

mcpmon automatically detects which files to watch:

1. Looks for the first script file in your arguments (`.js`, `.mjs`, `.ts`, `.py`, `.rb`, `.php`)
2. Falls back to current directory if no script file found
3. Can be overridden with `MCPMON_WATCH` environment variable

## How It Works

mcpmon acts as a transparent proxy between your MCP client and server:

```
MCP Client → mcpmon → Your MCP Server
(Claude)    (watches)    (reloads)
```

1. **File Watching**: Monitors your server files for changes using efficient filesystem events
2. **Smart Restart**: Cleanly shuts down and restarts your server (SIGTERM → SIGKILL)
3. **Message Buffering**: Queues incoming requests during restart (~1-2 second window)
4. **Seamless Handoff**: Replays buffered messages to the new server instance
5. **Client Transparency**: Client stays connected throughout the restart process
6. **Tool Discovery**: Automatically fetches and broadcasts updated tool list after restart

### Comparison to nodemon

| Feature | nodemon | mcpmon |
|---------|---------|---------|
| **Purpose** | Restart Node.js apps | Restart MCP servers |
| **Interface** | `nodemon script.js` | `mcpmon node script.js` |
| **File watching** | ✅ | ✅ |
| **Zero config** | ✅ | ✅ |
| **Message buffering** | ❌ | ✅ (MCP-specific) |
| **Protocol transparency** | ❌ | ✅ (MCP proxy) |
| **Multi-language** | Node.js focus | Any runtime |

## Logging and Debugging

mcpmon provides detailed logging to help troubleshoot issues:

### Verbose Mode

```bash
# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon node server.js
```

Output includes:
- 🔧 **Startup**: mcpmon initialization
- 📟 **Command**: Server command and arguments  
- 👀 **Watching**: Files being monitored
- 📝 **File changes**: Change events detected
- 🔄 **Restart**: Server restart sequence
- 🛑 **Shutdown**: Graceful shutdown process
- ✅ **Success**: Operations completed
- ❌ **Errors**: Detailed error information

### Debugging Tips

1. **Server won't start**: Check error logs for missing dependencies or invalid paths
2. **No hot reload**: Verify the watch file is detected (check 👀 logs with verbose mode)
3. **Slow restarts**: Increase `MCPMON_DELAY` if your server needs more startup time
4. **Missing tools**: Check server logs for initialization errors

## Testing

Comprehensive test suite with behavioral and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test suites
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
```

## Requirements

- [Node.js](https://nodejs.org/) 18 or higher
- macOS, Linux, or Windows

## Installation Options

### Global Installation (Recommended)

```bash
npm install -g mcpmon
```

### Local Development

```bash
git clone https://github.com/neilopet/mcpmon
cd mcpmon
npm install
npm run build
npm link
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `start` | Run mcpmon in production mode |
| `dev` | Run in development mode with file watching |
| `build` | Compile TypeScript to JavaScript |
| `clean` | Remove generated files |
| `lint` | Check code style and types |
| `format` | Format code with Prettier |
| `test` | Run all tests |
| `test:watch` | Run tests in watch mode |
| `test:coverage` | Generate coverage report |

## Troubleshooting

### Common Issues

**mcpmon command not found**
```bash
# Reinstall globally
npm install -g mcpmon

# Or use npx
npx mcpmon node server.js
```

**Server keeps crashing**
```bash
# Check server logs
MCPMON_VERBOSE=1 mcpmon node server.js

# Increase restart delay
MCPMON_DELAY=2000 mcpmon node server.js
```

**File changes not detected**
```bash
# Force watch specific files
MCPMON_WATCH="server.js,lib/" mcpmon node server.js
```

## Security

mcpmon requires standard Node.js permissions:

- **File system access**: Monitor files for changes
- **Process execution**: Start and stop your MCP server
- **Environment variables**: Read configuration
- **Network access**: Forward connections (if your server uses them)

No special permissions or elevated access required.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Format code: `npm run format`
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Like nodemon? You'll love mcpmon.** Simple, fast, and reliable hot-reload for MCP development.