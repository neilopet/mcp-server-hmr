# MCP Hot-Reload Proxy Usage Guide

## Overview
The MCP Hot-Reload Proxy sits between MCP clients (like Claude Code) and your MCP server, automatically restarting the server when source files change while buffering requests to ensure no interruptions.

## Quick Start

### 1. Using Claude-Flow's Built-in Proxy

```bash
# Install Claude-Flow if you haven't already
npm install -g claude-flow

# Start the proxy for your MCP server
claude-flow mcp proxy \
  --target ./my-mcp-server/index.js \
  --watch ./my-mcp-server/src \
  --transport stdio
```

### 2. Configure Claude Code to Use the Proxy

Instead of pointing Claude Code directly to your MCP server, point it to the proxy:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "claude-flow",
      "args": ["mcp", "proxy", "--target", "./path/to/my-mcp-server/index.js"]
    }
  }
}
```

## How It Works

1. **Request Forwarding**: The proxy forwards all MCP requests from clients to your actual server
2. **File Watching**: Monitors specified directories for changes
3. **Automatic Restart**: When files change, it gracefully stops the server and starts a new instance
4. **Request Buffering**: During restart, incoming requests are buffered and processed once the server is back
5. **Tool Update Notifications**: Automatically notifies clients when tools change

## Advanced Configuration

### Custom Watch Paths
```bash
claude-flow mcp proxy \
  --target ./server/index.js \
  --watch ./server/src,./server/tools,./server/config
```

### HTTP Transport
```bash
claude-flow mcp proxy \
  --target ./server/index.js \
  --transport http \
  --port 3000
```

### Custom Restart Delay
```bash
claude-flow mcp proxy \
  --target ./server/index.js \
  --restart-delay 1000  # Wait 1 second before restarting
```

## Building a Minimal Standalone Proxy

If you want a lightweight proxy without Claude-Flow's full features:

```typescript
// mcp-proxy.ts
import { HotReloadProxyTransport } from './proxy-hot-reload.ts';

const proxy = new HotReloadProxyTransport({
  targetPath: './my-server/index.js',
  targetCommand: 'node ./my-server/index.js',
  watchPaths: ['./my-server/src'],
  restartDelay: 500
}, logger, eventBus);

await proxy.start();
```

## Integration with Your MCP Server

No changes needed to your MCP server! The proxy works with any MCP-compliant server that supports stdio or HTTP transport.

## Benefits

- **Zero Downtime Development**: Clients stay connected during server restarts
- **Automatic Tool Discovery**: Clients are notified when tools change
- **Request Safety**: No requests are lost during restarts
- **Transport Agnostic**: Works with both stdio and HTTP transports
- **Minimal Configuration**: Just point and watch!

## Troubleshooting

### Server Not Restarting
- Check that watch paths are correct
- Ensure file system events are supported on your OS
- Verify the target command works when run manually

### Requests Timing Out
- Increase buffer size with `--buffer-size`
- Check server startup time and adjust `--restart-delay`
- Monitor proxy logs for errors

### Client Not Receiving Updates
- Ensure your MCP client supports the `tools/changed` notification
- Check that the proxy has proper permissions to send notifications

## Next Steps

1. **Custom Transforms**: Add request/response transformations in the proxy
2. **Multiple Servers**: Proxy multiple MCP servers through one endpoint
3. **Load Balancing**: Distribute requests across multiple server instances
4. **Development Tools**: Add request logging, debugging, and monitoring