#!/usr/bin/env node

/**
 * Simple MCP Server v1 - Built from @modelcontextprotocol/typescript-sdk
 * Returns "Result A" from test_tool
 */

const readline = require("readline");

// MCP Server state
const serverInfo = {
  name: "test-server-v1",
  version: "1.0.0",
};

const tools = [
  {
    name: "test_tool",
    description: "A simple test tool that returns a specific result",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "Test input parameter",
        },
      },
    },
  },
];

// Setup readline for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Handle incoming messages
rl.on("line", (line) => {
  try {
    const message = JSON.parse(line.trim());

    if (message.method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: serverInfo,
        },
      };
      console.log(JSON.stringify(response));
    } else if (message.method === "tools/list") {
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: tools,
        },
      };
      console.log(JSON.stringify(response));
    } else if (message.method === "tools/call") {
      const toolName = message.params?.name;

      if (toolName === "test_tool") {
        const response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              {
                type: "text",
                text: "Result A",
              },
            ],
          },
        };
        console.log(JSON.stringify(response));
      } else {
        const response = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        };
        console.log(JSON.stringify(response));
      }
    } else {
      // Unknown method
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`,
        },
      };
      console.log(JSON.stringify(response));
    }
  } catch (error) {
    console.error(`[Server v1] Parse error: ${error.message}`);
  }
});

// Handle process shutdown
process.on("SIGTERM", () => {
  console.error("[Server v1] Received SIGTERM, shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.error("[Server v1] Received SIGINT, shutting down...");
  process.exit(0);
});

console.error("[Server v1] MCP Test Server v1 started (returns Result A)");
