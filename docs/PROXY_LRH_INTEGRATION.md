# Proxy Integration for Large Response Handler

This document shows how the Large Response Handler would integrate with the existing MCPProxy.

## Key Integration Points

### 1. Configuration Extension

```typescript
// In src/interfaces.ts
export interface MCPProxyConfig {
  command: string;
  commandArgs: string[];
  watchTargets?: string[];
  restartDelay: number;
  env?: Record<string, string>;
  
  // NEW: Large Response Handler configuration
  largeResponseHandler?: {
    enabled: boolean;
    threshold: number;
    tokenThreshold?: number;
    dataDir?: string;
    enableDuckDB?: boolean;
    enableSchemaGeneration?: boolean;
    cacheTTL?: number;
    toolOverrides?: Record<string, any>;
  };
}
```

### 2. Proxy Modifications

```typescript
// In src/proxy.ts
import { LargeResponseHandler } from './large-response-handler.js';

export class MCPProxy {
  private lrh?: LargeResponseHandler;
  private lastToolRequest?: any;
  private sessionId: string;

  constructor(dependencies: ProxyDependencies, config: MCPProxyConfig) {
    // ... existing constructor code ...
    
    // Initialize Large Response Handler if enabled
    if (config.largeResponseHandler?.enabled) {
      this.sessionId = this.generateSessionId();
      this.lrh = new LargeResponseHandler(
        config.largeResponseHandler,
        this.sessionId
      );
    }
  }

  private setupOutputForwarding(
    stdout: NodeJS.ReadableStream,
    stderr: NodeJS.ReadableStream
  ) {
    // Existing stdout handling with LRH integration
    stdout.on("data", async (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter((line) => line.trim());
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          
          // Intercept tool responses
          if (this.lrh && message.id && message.result && this.lastToolRequest) {
            const toolName = this.lastToolRequest.params?.name;
            
            if (toolName && await this.lrh.shouldHandleResponse(message.result, toolName)) {
              // Process large response
              const metadata = await this.lrh.processLargeResponse(
                message.result,
                toolName,
                {
                  sessionId: this.sessionId,
                  originalRequest: this.lastToolRequest
                }
              );
              
              // Replace result with metadata
              message.result = metadata;
              
              // Notify about transformation
              console.error(`📦 Large response handled: ${toolName} (${metadata.metadata.sizeKB.toFixed(1)}KB → metadata)`);
            }
          }
          
          // Forward (possibly transformed) message
          this.stdout.write(JSON.stringify(message) + "\n");
        } catch (e) {
          // Not JSON, forward as-is
          this.stdout.write(line + "\n");
        }
      }
    });

    // ... existing stderr handling ...
  }

  private setupStdinForwarding() {
    // Track tool requests
    const forwardMessage = async (message: any) => {
      try {
        const parsed = JSON.parse(message);
        
        // Track tool call requests
        if (parsed.method === 'tools/call') {
          this.lastToolRequest = parsed;
        }
        
        // Inject LRH tools if enabled
        if (this.lrh && parsed.method === 'tools/list') {
          // Intercept tools/list response to inject our tools
          // (This would require more complex response interception)
        }
        
        this.managedProcess?.stdin?.write(message);
      } catch (e) {
        this.managedProcess?.stdin?.write(message);
      }
    };

    // ... rest of existing stdin forwarding ...
  }

  // Helper to generate session ID
  private generateSessionId(): string {
    return require('crypto')
      .createHash('md5')
      .update(`${Date.now()}-${this.config.command}`)
      .digest('hex')
      .substring(0, 8);
  }
}
```

### 3. Injected Tools

When LRH is enabled, mcpmon would inject additional tools into the MCP protocol:

```typescript
// In src/lrh-tools.ts
export const LRH_TOOLS = [
  {
    name: "mcpmon.analyze-with-duckdb",
    description: "Execute SQL queries on persisted datasets from large responses",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to execute"
        },
        database: {
          type: "string",
          description: "Path to DuckDB file from large response metadata"
        }
      },
      required: ["query", "database"]
    }
  },
  {
    name: "mcpmon.list-saved-datasets",
    description: "List available persisted datasets from large responses",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Optional session ID to filter results"
        },
        tool: {
          type: "string",
          description: "Optional tool name to filter results"
        }
      }
    }
  },
  {
    name: "mcpmon.get-dataset-info",
    description: "Get detailed information about a saved dataset",
    inputSchema: {
      type: "object",
      properties: {
        dataFile: {
          type: "string",
          description: "Path to the data file"
        }
      },
      required: ["dataFile"]
    }
  }
];
```

### 4. CLI Integration

```typescript
// In src/cli.ts
program
  .option('--lrh-enabled', 'Enable Large Response Handler')
  .option('--lrh-threshold <kb>', 'Response size threshold in KB', '25')
  .option('--lrh-data-dir <path>', 'Directory for persisted data')
  .option('--lrh-always-persist <tools>', 'Comma-separated tools to always persist')
  .parse(process.argv);

// Build config
const config: MCPProxyConfig = {
  // ... existing config ...
  largeResponseHandler: options.lrhEnabled ? {
    enabled: true,
    threshold: parseInt(options.lrhThreshold),
    dataDir: options.lrhDataDir,
    toolOverrides: parseToolOverrides(options.lrhAlwaysPersist)
  } : undefined
};
```

## Usage Examples

### 1. Basic Usage

```bash
# Enable LRH with default settings
MCPMON_LRH_ENABLED=true mcpmon node my-server.js

# Custom threshold and data directory
mcpmon --lrh-enabled --lrh-threshold 10 --lrh-data-dir /var/lib/mcpmon node server.js

# Always persist specific tools
mcpmon --lrh-enabled --lrh-always-persist "query-orders,get-inventory" node server.js
```

### 2. Client Interaction

```typescript
// Client makes a tool call that returns large data
const response = await client.callTool("query-orders", { status: "IN_PROGRESS" });

// Instead of 50MB of order data, receives:
{
  "status": "success_file_saved",
  "originalTool": "query-orders",
  "count": 15000,
  "dataFile": "/tmp/.mcpmon/a1b2c3d4/query-orders/response-1704067200000.json",
  "database": {
    "path": "/tmp/.mcpmon/a1b2c3d4/query-orders/database-1704067200000.duckdb",
    "tables": [{
      "name": "orders",
      "columns": [...],
      "rowCount": 15000
    }],
    "sampleQueries": [
      "SELECT * FROM orders LIMIT 10;",
      "SELECT status, COUNT(*) FROM orders GROUP BY status;"
    ]
  },
  "metadata": {
    "sizeKB": 51200,
    "estimatedTokens": 12800000,
    "timestamp": 1704067200000,
    "sessionId": "a1b2c3d4"
  }
}

// Client can now analyze the data
const analysis = await client.callTool("mcpmon.analyze-with-duckdb", {
  query: "SELECT status, COUNT(*) as count, AVG(total) as avg_total FROM orders GROUP BY status",
  database: response.database.path
});
```

### 3. Configuration File

```json
{
  "command": "node",
  "commandArgs": ["server.js"],
  "watchTargets": ["src/**/*.js"],
  "largeResponseHandler": {
    "enabled": true,
    "threshold": 20,
    "enableDuckDB": true,
    "enableSchemaGeneration": true,
    "toolOverrides": {
      "query-orders": {
        "alwaysPersist": true,
        "threshold": 5
      },
      "get-inventory": {
        "threshold": 50
      },
      "search-products": {
        "enabled": false
      }
    }
  }
}
```

## Benefits

1. **Transparent Integration**: Works with any MCP server without modifications
2. **Prevents Token Limit Errors**: Automatically handles responses that would exceed LLM limits
3. **Enables Analytics**: SQL queries on large datasets via DuckDB
4. **Session Persistence**: Data survives hot reloads
5. **Configurable**: Per-tool thresholds and behaviors
6. **Backward Compatible**: Only activates when enabled

## Implementation Phases

### Phase 1: Core Integration (MVP)
- Basic size detection
- File persistence
- Metadata responses
- CLI flags

### Phase 2: Database Integration
- DuckDB integration
- Injected analysis tools
- Schema generation

### Phase 3: Advanced Features
- Custom transformers
- Caching layer
- Progress notifications
- Cloud storage support

This integration would make mcpmon a powerful middleware for handling production-scale data in MCP servers while maintaining LLM compatibility.