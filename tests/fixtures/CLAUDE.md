# tests/fixtures/ - Test MCP Servers

## Purpose
Contains minimal MCP server implementations used for integration testing and end-to-end validation. These fixtures enable testing the complete hot-reload cycle with real MCP protocol communication.

## Files

### Test Servers
- **`mcp_server_v1.js`** - MCP server that returns "Result A" from test_tool
- **`mcp_server_v2.js`** - MCP server that returns "Result B" from test_tool

## Design Philosophy

### Minimal Implementation
These servers implement only the essential MCP methods needed for testing:

```javascript
// Core MCP protocol methods
- initialize: Returns server capabilities
- tools/list: Returns available tools
- tools/call: Executes tool and returns result
```

### Hot-Reload Validation
The two versions differ only in their tool responses:
- **v1**: `test_tool` returns "Result A"  
- **v2**: `test_tool` returns "Result B"

This enables testing the complete hot-reload cycle:
1. Start proxy with v1 server → verify "Result A"
2. Swap to v2 server file → trigger hot-reload
3. Verify tool now returns "Result B"
4. Confirms hot-reload works end-to-end

## MCP Protocol Implementation

### Initialize Handshake
```javascript
if (message.method === "initialize") {
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "test-server",
        version: "1.0.0"
      }
    }
  };
}
```

### Tool Discovery
```javascript
if (message.method === "tools/list") {
  return {
    jsonrpc: "2.0", 
    id: message.id,
    result: {
      tools: [{
        name: "test_tool",
        description: "A tool for testing hot reload functionality",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }]
    }
  };
}
```

### Tool Execution (The Key Difference)
```javascript
// mcp_server_v1.js
if (message.method === "tools/call" && toolName === "test_tool") {
  return {
    jsonrpc: "2.0",
    id: message.id, 
    result: {
      content: [{
        type: "text",
        text: "Result A"  // v1 returns A
      }]
    }
  };
}

// mcp_server_v2.js  
// Same structure but returns "Result B"
```

## Integration Test Usage

### Hot-Reload Cycle Testing
```javascript
// 1. Start with v1
mcpmon node mcp_server_v1.js

// 2. MCP client calls test_tool → "Result A"

// 3. Swap server file (simulates development)
cp mcp_server_v2.js mcp_server_v1.js  

// 4. mcpmon detects change and restarts server

// 5. MCP client calls test_tool → "Result B"
// ✅ Hot-reload working!
```

### Integration Test Implementation
```javascript
// integration-test/test_hotreload.cjs uses these fixtures
const client = new MCPClient();
await client.connect();

// Initial verification
let result = await client.callTool("test_tool");
expect(result.content[0].text).toBe("Result A");

// Trigger hot-reload by swapping files
await swapServerFiles();

// Wait for restart and verify change
await waitForRestart();
result = await client.callTool("test_tool");
expect(result.content[0].text).toBe("Result B");
```

## Key Features

### Realistic MCP Protocol
- **Proper JSON-RPC** - Correct message format and error handling
- **Standard Handshake** - Implements full initialize/capabilities exchange
- **Tool Lifecycle** - Discovery and execution following MCP spec
- **Error Handling** - Graceful handling of malformed requests

### Logging for Debug
```javascript
process.stderr.write(`[Server] Received: ${message.method}\n`);
process.stderr.write(`[Server] Returning tool result: ${result}\n`);
```

### Signal Handling
```javascript
process.on('SIGTERM', () => {
  process.stderr.write('[Server] Received SIGTERM, shutting down...\n');
  process.exit(0);
});
```

## Development Notes

### Why Two Separate Files?
- **Clear difference** - Easy to verify which version is running
- **File watching** - Tests that mcpmon detects file changes correctly
- **Tool updates** - Validates that tool list changes are propagated

### Minimal Dependencies
- **Pure Node.js** - No external dependencies for reliability
- **Simple logic** - Easy to understand and modify
- **Fast startup** - Minimal initialization time for testing

### Testing Scenarios
These fixtures enable testing:
- **Basic hot-reload** - File change → server restart → new behavior
- **Client persistence** - MCP client stays connected during restart
- **Message buffering** - Requests during restart are not lost
- **Tool discovery** - Updated tool lists are sent to client
- **Error recovery** - Server crashes and recovers properly

## Usage in Tests

### Integration Tests
```bash
# End-to-end hot-reload test
node integration-test/test_hotreload.cjs

# Manual testing with MCP Inspector
npx @modelcontextprotocol/inspector mcpmon node tests/fixtures/mcp_server_v1.js
```

### Development Testing
```bash
# Quick manual test
mcpmon node tests/fixtures/mcp_server_v1.js

# In another terminal, edit the file to change "Result A" to "Result B"
# Watch mcpmon restart the server automatically
```

## Future Enhancements

### Additional Test Scenarios
- **Error server** - Returns errors to test error handling
- **Slow server** - Delays responses to test timeouts
- **Resource server** - Tests resource reading capabilities
- **Complex tools** - Tools with parameters and complex schemas

### Protocol Coverage
- **Notifications** - Test notification handling
- **Resources** - Test resource reading/writing
- **Prompts** - Test prompt template functionality

These fixtures provide the foundation for validating that mcpmon correctly handles real MCP protocol communication during hot-reload scenarios.