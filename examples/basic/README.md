# Basic mcpmon Example

This example demonstrates the simplest possible setup for mcpmon with a basic Node.js MCP server.

## Files

- `server.js` - A minimal MCP server that responds to basic requests
- `README.md` - This file

## Quick Start

1. **Install mcpmon globally:**
   ```bash
   npm install -g mcpmon
   ```

2. **Run the server with mcpmon:**
   ```bash
   # From this directory
   mcpmon node server.js
   
   # Or with absolute path
   mcpmon node /path/to/claude-live-reload/examples/basic/server.js
   ```

3. **Test hot-reload:**
   - Edit `server.js`
   - Add a new tool or change existing descriptions  
   - Save the file and watch mcpmon restart the server

## Expected Output

When starting mcpmon:

```
🔧 mcpmon starting...
📟 Command: node server.js
👀 Watching: server.js
🚀 Starting MCP server...
✅ Server started with PID: 12345
```

When you modify `server.js`:

```
📝 File modify: server.js
🔄 File change detected, restarting server...
🛑 Killing server process 12345...
✅ Server process 12345 terminated
🚀 Starting MCP server...
✅ Server started with PID: 12346
📢 Sent tool change notification with X tools
✅ Server restart complete
```

## Integration with Claude Desktop

Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "basic-example": {
      "command": "mcpmon",
      "args": ["node", "/path/to/claude-live-reload/examples/basic/server.js"]
    }
  }
}
```

## Integration with MCP Inspector

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector mcpmon node server.js
```

Now Claude will automatically see any changes you make to the server!

## Troubleshooting

**mcpmon command not found?**
```bash
# Install globally
npm install -g mcpmon

# Or use with npx
npx mcpmon node server.js
```

**Want verbose logging?**
```bash
MCPMON_VERBOSE=1 mcpmon node server.js
```