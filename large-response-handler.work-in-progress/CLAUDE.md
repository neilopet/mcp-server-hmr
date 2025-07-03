# Large Response Handler (LRH) Extension

## Overview

The Large Response Handler (LRH) extension is an adaptation of the LRH pattern originally developed at ChannelApe for handling API responses that exceed token limits in Large Language Models (LLMs). This implementation leverages mcpmon's unique position as a proxy between MCP servers and clients to transparently intercept and handle large responses without requiring changes to the underlying MCP servers or clients.

## Problem Statement

When MCP tools return responses that exceed the token limits of LLMs (typically 8,192 tokens for tool outputs), the LLM encounters an error and cannot process the response. This is particularly common with:

- Database query results returning thousands of rows
- File system operations listing large directories
- API responses with extensive nested data
- Log file analysis with verbose output

Traditional solutions require modifying the tool implementation to paginate or limit results, but this approach doesn't scale across multiple MCP servers and tools.

## Solution Approach

The LRH extension solves this problem by:

1. **Automatic Detection**: Monitoring all tool responses flowing through mcpmon
2. **Transparent Interception**: When a response exceeds the threshold, it's automatically persisted
3. **Response Replacement**: The original large response is replaced with a summary and reference
4. **Query Tools**: Injecting new tools that allow the LLM to analyze the persisted data

### Architecture

```
┌─────────┐      ┌─────────┐      ┌─────────────┐
│   LLM   │◄────►│ mcpmon  │◄────►│ MCP Server  │
└─────────┘      │  (LRH)  │      └─────────────┘
                 └─────────┘
                      │
                      ▼
                 ┌─────────┐
                 │ DuckDB  │
                 └─────────┘
```

## Implementation Details

### Detection and Interception

The extension monitors all `tools/call` responses and checks their size:

```typescript
// Token estimation (conservative)
const estimatedTokens = Math.ceil(responseSize / 3);

if (estimatedTokens > threshold) {
  // Trigger LRH handling
}
```

### Data Persistence

Large responses are persisted using a hierarchical file structure:

```
~/.mcpmon/
└── lrh/
    └── datasets/
        └── 2024/
            └── 01/
                └── 15/
                    ├── dataset_12345678_metadata.json
                    └── dataset_12345678_data.json
```

**Metadata Schema:**
```json
{
  "id": "dataset_12345678",
  "timestamp": "2024-01-15T10:30:00Z",
  "tool": "database_query",
  "server": "postgres-mcp",
  "originalSize": 250000,
  "recordCount": 5000,
  "schema": {
    "fields": [
      { "name": "id", "type": "integer" },
      { "name": "name", "type": "string" },
      { "name": "created_at", "type": "timestamp" }
    ]
  },
  "summary": {
    "totalRecords": 5000,
    "sampleRecords": 5,
    "distinctValues": {
      "status": ["active", "inactive", "pending"]
    }
  }
}
```

### Schema Generation

The extension automatically infers schemas from the data:

1. **Array Detection**: Identifies if the response is an array of objects
2. **Type Inference**: Analyzes sample records to determine field types
3. **Statistics Generation**: Calculates basic statistics for the summary

### DuckDB Integration

Persisted datasets are automatically loaded into DuckDB for efficient querying:

```sql
-- Automatic table creation
CREATE TABLE dataset_12345678 AS 
SELECT * FROM read_json_auto('path/to/dataset_12345678_data.json');

-- Indexed for common patterns
CREATE INDEX idx_dataset_timestamp ON dataset_12345678(timestamp);
```

## Injected Tools

### 1. analyze-with-duckdb

Allows SQL queries against persisted datasets:

```typescript
{
  "name": "analyze-with-duckdb",
  "description": "Query persisted large datasets using SQL",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "SQL query to execute"
      },
      "dataset_id": {
        "type": "string",
        "description": "Optional specific dataset ID"
      }
    },
    "required": ["query"]
  }
}
```

### 2. list-saved-datasets

Lists available persisted datasets:

```typescript
{
  "name": "list-saved-datasets",
  "description": "List all saved large response datasets",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": {
        "type": "object",
        "properties": {
          "tool": { "type": "string" },
          "server": { "type": "string" },
          "date_from": { "type": "string" },
          "date_to": { "type": "string" }
        }
      }
    }
  }
}
```

## Configuration

The extension can be configured via environment variables or mcpmon config:

```yaml
extensions:
  large-response-handler:
    enabled: true
    threshold: 8192  # tokens
    persist_location: "~/.mcpmon/lrh/datasets"
    cleanup_after_days: 30
    excluded_tools:
      - "get_file_contents"  # Some tools should never be persisted
    schema_inference:
      sample_size: 100
      type_detection: true
    duckdb:
      memory_limit: "1GB"
      threads: 4
```

## Tool Response Override

When a large response is detected, the original response is replaced with:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Large response detected (5000 records, ~25000 tokens). Data has been saved as dataset_12345678.\n\nSummary:\n- Total records: 5000\n- Fields: id, name, created_at, status\n- Status distribution: active (3000), inactive (1500), pending (500)\n\nUse 'analyze-with-duckdb' to query this dataset:\nExample: SELECT * FROM dataset_12345678 WHERE status = 'active' LIMIT 10"
    }
  ]
}
```

## Usage Examples

### Example 1: Database Query Response

Original tool call:
```typescript
await tools.call({
  name: "execute_query",
  arguments: { query: "SELECT * FROM users" }
});
```

LRH-handled response:
```typescript
// Instead of 50MB of user data, the LLM receives:
{
  "content": [{
    "type": "text",
    "text": "Large dataset saved as dataset_abc123 (50,000 users)..."
  }]
}
```

Follow-up analysis:
```typescript
await tools.call({
  name: "analyze-with-duckdb",
  arguments: {
    query: "SELECT COUNT(*) as count, country FROM dataset_abc123 GROUP BY country ORDER BY count DESC LIMIT 10"
  }
});
```

### Example 2: File System Listing

Original:
```typescript
await tools.call({
  name: "list_directory",
  arguments: { path: "/var/log", recursive: true }
});
```

LRH-handled response provides a summary and enables:
```typescript
await tools.call({
  name: "analyze-with-duckdb",
  arguments: {
    query: "SELECT * FROM dataset_xyz789 WHERE file_size > 1000000 AND extension = '.log'"
  }
});
```

## Dependencies

- **DuckDB**: In-memory analytical database for efficient querying
- **Node.js fs**: File system operations for persistence
- **JSON Schema**: For automatic schema inference
- **Zod**: Runtime type validation

## Performance Considerations

1. **Memory Usage**: DuckDB tables are loaded on-demand and released after idle timeout
2. **Disk Space**: Automatic cleanup of datasets older than configured retention period
3. **Response Latency**: Initial interception adds ~50-100ms for schema inference
4. **Query Performance**: DuckDB provides sub-second queries on datasets with millions of rows

## Benefits of Proxy-Based Implementation

1. **Zero Configuration**: Works with any MCP server without modification
2. **Transparent**: LLMs automatically adapt to the summarized responses
3. **Consistent Interface**: All large responses handled uniformly
4. **Historical Analysis**: Persisted datasets enable longitudinal analysis
5. **Resource Efficient**: Prevents LLM token limit errors and reduces API costs

## Future Enhancements

- [ ] Streaming support for real-time data processing
- [ ] Automatic data compression for older datasets
- [ ] Cross-dataset JOIN operations
- [ ] Export to common formats (CSV, Parquet)
- [ ] Visualization tool integration
- [ ] Smart sampling strategies for better summaries