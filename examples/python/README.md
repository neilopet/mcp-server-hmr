# Python MCP Hot-Reload Example

This example shows how to use MCP Hot-Reload with a Python-based MCP server.

## Files

- `server.py` - A Python MCP server using the standard library
- `.env` - Configuration for the hot-reload proxy
- `requirements.txt` - Python dependencies (if any)
- `README.md` - This file

## Prerequisites

- Python 3.8+ installed
- Node.js (for testing with the included test client)

## Setup

1. **Install Python dependencies (if any):**
   ```bash
   pip install -r requirements.txt
   ```

2. **Make the server executable:**
   ```bash
   chmod +x server.py
   ```

3. **Copy the configuration:**
   ```bash
   cp .env ../../../.env
   ```

4. **Start the hot-reload proxy:**
   ```bash
   cd ../../../
   deno task start
   ```

## Testing Hot-Reload

1. **Modify `server.py`:**
   - Change tool descriptions
   - Add new tools to the `TOOLS` list
   - Modify the logic in `handle_tool_call()`

2. **Save the file and observe the output:**
   ```
   📝 File change detected: examples/python/server.py
   🔄 Restarting server...
   ✅ Server restarted with PID: 12347
   ```

## Example Modifications

Try these changes to see hot-reload in action:

**Add a new tool:**

```python
{
    "name": "get_weather",
    "description": "Get current weather (mock)",
    "inputSchema": {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "City name"}
        }
    }
}
```

**Modify existing tool descriptions:**

```python
"description": "Calculate mathematical expressions - UPDATED!"
```

## Integration with Claude Desktop

```json
{
  "mcpServers": {
    "python-example": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-read",
        "--allow-run",
        "/path/to/claude-live-reload/src/main.ts"
      ],
      "env": {
        "MCP_SERVER_COMMAND": "python",
        "MCP_SERVER_ARGS": "/path/to/claude-live-reload/examples/python/server.py",
        "MCP_WATCH_FILE": "/path/to/claude-live-reload/examples/python/server.py"
      }
    }
  }
}
```
