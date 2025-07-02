# Quick Start Example

This example shows how to set up mcpmon with a simple Node.js MCP server for hot-reload development.

## 1. Create a Simple MCP Server

Create `my-mcp-server.js`:

```javascript
#!/usr/bin/env node

console.error("[Server] Starting MCP server...");

// Respond to initialize
process.stdin.on("data", (data) => {
  const lines = data.toString().trim().split("\n");

  lines.forEach((line) => {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);
      console.error(`[Server] Received: ${message.method || "response"}`);

      if (message.method === "initialize") {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              capabilities: {},
              serverInfo: {
                name: "my-mcp-server",
                version: "1.0.0",
              },
            },
          }) + "\n",
        );
      }

      if (message.method === "tools/list") {
        // Change this array to test hot reload!
        const tools = [
          {
            name: "get_time",
            description: "Get current time",
            inputSchema: { type: "object", properties: {} },
          },
        ];

        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: { tools },
          }) + "\n",
        );
      }
    } catch (e) {
      console.error("[Server] Parse error:", e.message);
    }
  });
});

// Handle shutdown
process.on("SIGTERM", () => {
  console.error("[Server] Received SIGTERM, shutting down...");
  process.exit(0);
});
```

## 2. Install mcpmon

```bash
# Install globally
npm install -g mcpmon

# Or use with npx (no installation needed)
npx mcpmon node my-mcp-server.js
```

## 3. Run with mcpmon

```bash
# Basic usage
mcpmon node my-mcp-server.js

# With verbose logging to see what's happening
MCPMON_VERBOSE=1 mcpmon node my-mcp-server.js
```

You should see:

```
🔧 mcpmon starting...
📟 Command: node my-mcp-server.js
👀 Watching: my-mcp-server.js
🚀 Starting MCP server...
[Server] Starting MCP server...
✅ Server started with PID: 12345
```

## 4. Test Hot Reload

1. In another terminal, modify `my-mcp-server.js`:
   - Add a new tool to the tools array
   - Change a description
   - Add a console.error message

2. Save the file and watch mcpmon:
   ```
   📝 File modify: my-mcp-server.js
   🔄 File change detected, restarting server...
   🛑 Killing server process 12345...
   ✅ Server process 12345 terminated
   🚀 Starting MCP server...
   [Server] Starting MCP server...
   ✅ Server started with PID: 12346
   📢 Sent tool change notification with X tools
   ✅ Server restart complete
   ```

## 5. Use with MCP Inspector

Test your server with MCP Inspector:

```bash
# Direct usage
npx @modelcontextprotocol/inspector mcpmon node my-mcp-server.js

# With environment variables
API_KEY=your-key npx @modelcontextprotocol/inspector mcpmon node my-mcp-server.js
```

## 6. Connect with Claude Desktop

Update your Claude Desktop config:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "/absolute/path/to/my-mcp-server.js"],
      "env": {
        "API_KEY": "your-key-if-needed"
      }
    }
  }
}
```

Now when you save changes to `my-mcp-server.js`, Claude will automatically see the updated tools!

## Advanced Usage

### Custom file watching

```bash
# Watch specific files
MCPMON_WATCH="server.js,config.json" mcpmon node my-mcp-server.js

# Change restart delay
MCPMON_DELAY=2000 mcpmon node my-mcp-server.js
```

### Python MCP Server

```bash
# Python server
mcpmon python -m my_mcp_server

# With arguments
mcpmon python server.py --port 3000
```

### Deno MCP Server

```bash
# Deno server
mcpmon deno run --allow-all server.ts
```

## Tips

- Add more console.error messages to your server to see what's happening
- Try breaking your server (syntax error) to see how mcpmon handles it
- Use `MCPMON_VERBOSE=1` to see detailed logging
- Experiment with different file changes to understand the restart behavior
- Check the logs if something doesn't work as expected

## Troubleshooting

**Server won't start?**
```bash
# Test your server directly first
node my-mcp-server.js

# Then run with mcpmon
mcpmon node my-mcp-server.js
```

**No hot reload?**
```bash
# Enable verbose logging to see what files are being watched
MCPMON_VERBOSE=1 mcpmon node my-mcp-server.js
```

**Too many restarts?**
```bash
# Increase restart delay
MCPMON_DELAY=2000 mcpmon node my-mcp-server.js
```