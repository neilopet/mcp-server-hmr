# Basic MCP Hot-Reload Example

This example demonstrates the simplest possible setup for MCP Hot-Reload with a basic Node.js MCP server.

## Files

- `server.js` - A minimal MCP server that responds to basic requests
- `.env` - Configuration for the hot-reload proxy
- `README.md` - This file

## Quick Start

1. **Copy the configuration:**
   ```bash
   cp .env ../../../.env
   ```

2. **Start the hot-reload proxy:**
   ```bash
   cd ../../../
   npm start
   ```

3. **Test hot-reload:**
   - Edit `server.js`
   - Add a new tool or change existing descriptions
   - Save the file and watch the proxy restart the server

## Expected Output

When starting the proxy:

```
🚀 Starting MCP Hot-Reload Proxy
📟 Server: node examples/basic/server.js
👀 Watching: examples/basic/server.js
✅ Server started with PID: 12345
```

When you modify `server.js`:

```
📝 File change detected: examples/basic/server.js
🔄 Restarting server...
✅ Server restarted with PID: 12346
```

## Integration with Claude Desktop

Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "basic-example": {
      "command": "mcp-hmr",
      "args": ["node", "/path/to/claude-live-reload/examples/basic/server.js"]
    }
  }
}
```

Now Claude will automatically see any changes you make to the server!
