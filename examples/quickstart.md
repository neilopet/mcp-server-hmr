# Quick Start Example

This example shows how to set up MCP Server HMR with a simple Node.js MCP server.

## 1. Create a Simple MCP Server

Create `my-mcp-server.js`:

```javascript
#!/usr/bin/env node

console.error("[Server] Starting MCP server...");

// Respond to initialize
process.stdin.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    try {
      const message = JSON.parse(line);
      console.error(`[Server] Received: ${message.method || 'response'}`);
      
      if (message.method === 'initialize') {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            capabilities: {},
            serverInfo: {
              name: "my-mcp-server",
              version: "1.0.0"
            }
          }
        }) + '\n');
      }
      
      if (message.method === 'tools/list') {
        // Change this array to test hot reload!
        const tools = [
          {
            name: "get_time",
            description: "Get current time",
            inputSchema: { type: "object", properties: {} }
          }
        ];
        
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { tools }
        }) + '\n');
      }
    } catch (e) {
      console.error("[Server] Parse error:", e.message);
    }
  });
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.error("[Server] Received SIGTERM, shutting down...");
  process.exit(0);
});
```

## 2. Configure MCP Server HMR

Create `.env` in the HMR directory:

```env
MCP_SERVER_COMMAND="node"
MCP_SERVER_ARGS="/path/to/my-mcp-server.js"
```

## 3. Run the Proxy

```bash
cd mcp-server-hmr
deno task dev
```

You should see:
```
🚀 Starting MCP Server HMR
📟 Server: node /path/to/my-mcp-server.js
👀 Watching: /path/to/my-mcp-server.js
[Server] Starting MCP server...
✅ Server started with PID: 12345
```

## 4. Test Hot Reload

1. In another terminal, modify `my-mcp-server.js`:
   - Add a new tool to the tools array
   - Change a description
   - Add a console.error message

2. Save the file and watch the HMR proxy:
   ```
   📝 File modify: /path/to/my-mcp-server.js
   🔄 File change detected, restarting server...
   🛑 Killing server process 12345...
   ✅ Server process 12345 terminated
   🚀 Starting MCP server...
   [Server] Starting MCP server...
   ✅ Server started with PID: 12346
   📢 Sent tool change notification with X tools
   ✅ Server restart complete
   ```

## 5. Connect with Claude Desktop

Update your Claude Desktop config:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-read", "--allow-run", "/path/to/mcp-server-hmr/src/main.ts"],
      "env": {
        "MCP_SERVER_COMMAND": "node",
        "MCP_SERVER_ARGS": "/path/to/my-mcp-server.js"
      }
    }
  }
}
```

Now when you save changes to `my-mcp-server.js`, Claude will automatically see the updated tools!

## Tips

- Add more console.error messages to your server to see what's happening
- Try breaking your server (syntax error) to see how HMR handles it
- Experiment with different file changes to understand the restart behavior
- Check the logs if something doesn't work as expected