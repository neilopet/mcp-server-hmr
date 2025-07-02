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
- **Library support** - Import as a dependency for custom monitoring solutions

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

mcpmon works out of the box with **zero configuration**. It automatically detects your server file and starts watching for changes.

To watch additional files:
```bash
# Watch multiple files
MCPMON_WATCH="server.js,config.json" mcpmon node server.js
```

That's it! mcpmon is designed to work with zero configuration.

### Environment Variables

- `MCPMON_WATCH` - Override files/directories to watch (comma-separated)
- `MCPMON_DELAY` - Restart delay in milliseconds (default: 1000)
- `MCPMON_VERBOSE` - Enable verbose logging

## How It Works

mcpmon sits between your MCP client and server, automatically restarting your server when files change:

```
MCP Client → mcpmon → Your MCP Server
(Claude)    (proxy)     (auto-restart)
```

**The magic:** Your MCP client stays connected while your server reloads. No need to reconnect Claude Desktop or restart MCP Inspector!

| Feature | Without mcpmon | With mcpmon |
|---------|---------|---------|
| **File changes** | Manual restart required | Automatic restart |
| **Client connection** | Must reconnect | Stays connected |
| **Lost messages** | Possible | Never (buffered) |
| **Setup complexity** | Manual config changes | Just add `mcpmon` |

## Need Help?

**Enable verbose logging** to see what's happening:
```bash
MCPMON_VERBOSE=1 mcpmon node server.js
```

**Common issues:**
- **Server won't start?** Check the error messages for missing dependencies
- **No hot reload?** Verify your server file is being detected in the logs
- **Need help?** See our [Troubleshooting Guide](TROUBLESHOOTING.md)

## Development

```bash
# Run tests
npm test

# Development mode
npm run dev
```

See [Contributing Guide](CONTRIBUTING.md) for more details.

## Installation

**Requirements:** [Node.js](https://nodejs.org/) 18+

```bash
# Install globally (recommended)
npm install -g mcpmon

# Or use without installing
npx mcpmon node server.js
```

## Contributing

We welcome contributions! See [Contributing Guide](CONTRIBUTING.md) for details.

## Documentation

- [API Documentation](docs/api.md) - Library usage and advanced features
- [Architecture Guide](docs/architecture.md) - How mcpmon works internally
- [Testing Guide](docs/testing.md) - Test architecture and patterns
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Changelog](CHANGELOG.md) - Version history and changes

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Like nodemon? You'll love mcpmon.** Simple, fast, and reliable hot-reload for MCP development.