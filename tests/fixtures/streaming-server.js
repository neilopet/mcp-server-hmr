#!/usr/bin/env node

/**
 * Streaming MCP Server - Demonstrates streaming large responses
 * Built for testing the Large Response Handler extension
 */

const readline = require("readline");

// MCP Server state
const serverInfo = {
  name: "streaming-test-server",
  version: "1.0.0",
};

const tools = [
  {
    name: "stream_large_data",
    description: "Streams a large dataset in chunks to test large response handling",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of items to generate (default: 1000)",
          default: 1000,
        },
        chunkSize: {
          type: "number",
          description: "Number of items per chunk (default: 100)",
          default: 100,
        },
        delayMs: {
          type: "number",
          description: "Delay between chunks in milliseconds (default: 100)",
          default: 100,
        },
        includeProgress: {
          type: "boolean",
          description: "Include progress notifications (default: true)",
          default: true,
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

// Helper to generate test data
function generateTestItem(index) {
  return {
    id: `item_${index}`,
    name: `Test Item ${index}`,
    description: `This is a detailed description for item ${index} with some additional text to make it more realistic`,
    timestamp: new Date().toISOString(),
    value: Math.random() * 1000,
    tags: [`tag${index % 5}`, `category${index % 3}`, `type${index % 7}`],
    metadata: {
      created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      modified: new Date().toISOString(),
      version: Math.floor(Math.random() * 10) + 1,
      active: Math.random() > 0.3,
    },
    nested: {
      level1: {
        level2: {
          level3: {
            deepValue: `Deep value for item ${index}`,
            deepArray: Array(5).fill(0).map((_, i) => `element_${i}_${index}`),
          },
        },
      },
    },
  };
}

// Helper to send a JSON-RPC message
function sendMessage(message) {
  console.log(JSON.stringify(message));
}

// Stream large data response
async function streamLargeData(messageId, params, progressToken) {
  const count = params?.count || 1000;
  const chunkSize = params?.chunkSize || 100;
  const delayMs = params?.delayMs || 100;
  const includeProgress = params?.includeProgress !== false;

  // Send initial progress if token provided
  if (progressToken && includeProgress) {
    sendMessage({
      jsonrpc: "2.0",
      method: "$/progress",
      params: {
        progressToken: progressToken,
        progress: {
          kind: "start",
          title: "Streaming large dataset",
          message: `Preparing to stream ${count} items...`,
        },
      },
    });
  }

  // Initialize the streaming response
  const items = [];
  let sentCount = 0;

  // Process in chunks
  const totalChunks = Math.ceil(count / chunkSize);
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startIdx = chunkIndex * chunkSize;
    const endIdx = Math.min(startIdx + chunkSize, count);
    const chunkItems = [];

    // Generate items for this chunk
    for (let i = startIdx; i < endIdx; i++) {
      chunkItems.push(generateTestItem(i));
    }

    items.push(...chunkItems);
    sentCount += chunkItems.length;

    // Send progress update
    if (progressToken && includeProgress) {
      sendMessage({
        jsonrpc: "2.0",
        method: "$/progress",
        params: {
          progressToken: progressToken,
          progress: {
            kind: "progress",
            percentage: Math.round((sentCount / count) * 100),
            message: `Processed ${sentCount} of ${count} items...`,
          },
        },
      });
    }

    // Send partial result (streaming chunk)
    if (chunkIndex < totalChunks - 1) {
      // Intermediate chunk
      sendMessage({
        jsonrpc: "2.0",
        id: messageId,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                chunk: chunkIndex + 1,
                totalChunks: totalChunks,
                items: chunkItems,
                partial: true,
                summary: {
                  processed: sentCount,
                  total: count,
                  complete: false,
                },
              }, null, 2),
            },
          ],
          isPartial: true,
        },
      });
    } else {
      // Final chunk
      sendMessage({
        jsonrpc: "2.0",
        id: messageId,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                chunk: chunkIndex + 1,
                totalChunks: totalChunks,
                items: chunkItems,
                partial: false,
                summary: {
                  processed: sentCount,
                  total: count,
                  complete: true,
                  totalSize: JSON.stringify(items).length,
                  averageItemSize: Math.round(JSON.stringify(items).length / count),
                },
              }, null, 2),
            },
          ],
          isPartial: false,
        },
      });
    }

    // Simulate processing delay
    if (chunkIndex < totalChunks - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Send final progress
  if (progressToken && includeProgress) {
    sendMessage({
      jsonrpc: "2.0",
      method: "$/progress",
      params: {
        progressToken: progressToken,
        progress: {
          kind: "end",
          message: `Successfully streamed ${count} items`,
        },
      },
    });
  }
}

// Handle incoming messages
rl.on("line", async (line) => {
  try {
    const message = JSON.parse(line.trim());

    if (message.method === "initialize") {
      sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            experimental: {
              streaming: true,
            },
          },
          serverInfo: serverInfo,
        },
      });
    } else if (message.method === "tools/list") {
      sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: tools,
        },
      });
    } else if (message.method === "tools/call") {
      const toolName = message.params?.name;
      const progressToken = message.params?.progressToken;

      if (toolName === "stream_large_data") {
        // Handle streaming response asynchronously
        await streamLargeData(message.id, message.params?.arguments, progressToken);
      } else {
        sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        });
      }
    } else {
      // Unknown method
      sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`,
        },
      });
    }
  } catch (error) {
    console.error(`[Streaming Server] Error: ${error.message}`);
    // Send error response if we have a message id
    if (error.message && message?.id) {
      sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`,
        },
      });
    }
  }
});

// Handle process shutdown
process.on("SIGTERM", () => {
  console.error("[Streaming Server] Received SIGTERM, shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.error("[Streaming Server] Received SIGINT, shutting down...");
  process.exit(0);
});

console.error("[Streaming Server] MCP Streaming Test Server started");
console.error("[Streaming Server] Tool: stream_large_data - generates and streams large datasets");