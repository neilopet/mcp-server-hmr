# Large Response Handler Extension

## Overview

The Large Response Handler (LRH) extension automatically detects and handles MCP tool responses that exceed configurable size thresholds. Instead of forwarding large responses that would cause token limit errors in LLMs, it:

1. Persists the data to disk
2. Generates JSON schemas
3. Creates queryable DuckDB databases
4. Returns structured metadata

## Features

- **Automatic Detection**: Monitors all tool responses for size thresholds
- **Configurable Thresholds**: Per-tool or global size/token limits
- **Data Persistence**: Saves large responses with session-based organization
- **Schema Generation**: Creates JSON schemas using quicktype
- **SQL Analytics**: DuckDB integration for powerful queries
- **Injected Tools**: Adds `analyze-with-duckdb` and `list-saved-datasets` tools

## Configuration

```json
{
  "extensions": {
    "large-response-handler": {
      "threshold": 25,              // KB threshold
      "tokenThreshold": 20000,      // Estimated token threshold
      "enableDuckDB": true,         // Enable SQL analytics
      "enableSchemaGeneration": true,
      "cacheTTL": 300000,          // 5 minutes
      "toolOverrides": {
        "query-orders": {
          "alwaysPersist": true,    // Always save this tool's responses
          "threshold": 5            // Lower threshold for this tool
        }
      }
    }
  }
}
```

## Usage

### Enable the Extension

```bash
# Via CLI flag
mcpmon --enable-extension large-response-handler node server.js

# Via environment variable
MCPMON_EXTENSIONS="large-response-handler" mcpmon node server.js
```

### Working with Large Responses

When a tool returns a large response, you'll receive metadata instead:

```json
{
  "status": "success_file_saved",
  "originalTool": "query-orders",
  "count": 15000,
  "dataFile": "/tmp/.mcpmon/abc123/query-orders/response-1704067200000.json",
  "database": {
    "path": "/tmp/.mcpmon/abc123/query-orders/database-1704067200000.duckdb",
    "tables": [
      {
        "name": "orders",
        "columns": [...],
        "rowCount": 15000
      }
    ],
    "sampleQueries": [
      "SELECT * FROM orders LIMIT 10;",
      "SELECT status, COUNT(*) FROM orders GROUP BY status;"
    ]
  },
  "metadata": {
    "sizeKB": 51200,
    "estimatedTokens": 12800000,
    "timestamp": 1704067200000,
    "sessionId": "abc123"
  }
}
```

### Analyzing Saved Data

Use the injected `mcpmon.analyze-with-duckdb` tool:

```typescript
const analysis = await callTool("mcpmon.analyze-with-duckdb", {
  query: "SELECT status, COUNT(*) as count, AVG(total) as avg FROM orders GROUP BY status",
  database: "/tmp/.mcpmon/abc123/query-orders/database-1704067200000.duckdb"
});
```

### Listing Saved Datasets

```typescript
const datasets = await callTool("mcpmon.list-saved-datasets", {
  sessionId: "abc123",  // Optional filter
  tool: "query-orders"  // Optional filter
});
```

## File Organization

```
/tmp/.mcpmon/
└── {sessionId}/
    └── large-response-handler/
        └── {toolName}/
            ├── response-{timestamp}.json      # Raw data
            ├── schema-{timestamp}.json        # JSON schema
            ├── database-{timestamp}.duckdb    # Queryable database
            └── metadata-{timestamp}.json      # Response metadata
```

## Dependencies

- `duckdb`: For creating analytical databases (optional)
- `quicktype-core`: For JSON schema generation (optional)

Both dependencies are loaded dynamically only when their features are enabled.

## Performance Considerations

- **Memory**: Large responses are streamed to disk to avoid memory issues
- **Disk Space**: Monitor disk usage, especially with large datasets
- **Query Performance**: DuckDB provides excellent analytical query performance
- **Caching**: Responses are cached based on request parameters

## Troubleshooting

### "Database file is locked"
- The extension waits for DuckDB operations to complete
- If persistent, check for orphaned database connections

### "Schema generation failed"
- Usually due to heterogeneous data
- The extension continues without schema on failure

### "Token limit still exceeded"
- Check if metadata response itself is too large
- Adjust logging verbosity or response detail level

## Future Enhancements

- Streaming support for responses larger than memory
- Incremental database updates
- Cloud storage backend support
- Custom transformers per tool
- Compression for stored data