# Python mcpmon Example

This example shows how to use mcpmon with a Python-based MCP server.

## Files

- `server.py` - A Python MCP server using the standard library
- `requirements.txt` - Python dependencies (if any)
- `README.md` - This file

## Prerequisites

- Python 3.8+ installed
- mcpmon installed (`npm install -g mcpmon`)

## Setup

1. **Install Python dependencies (if any):**
   ```bash
   pip install -r requirements.txt
   ```

2. **Make the server executable:**
   ```bash
   chmod +x server.py
   ```

3. **Run with mcpmon:**
   ```bash
   # From this directory
   mcpmon python server.py
   
   # Or with absolute path
   mcpmon python /path/to/claude-live-reload/examples/python/server.py
   ```

## Expected Output

When starting mcpmon:

```
🔧 mcpmon starting...
📟 Command: python server.py
👀 Watching: server.py
🚀 Starting MCP server...
✅ Server started with PID: 12345
```

## Testing Hot-Reload

1. **Modify `server.py`:**
   - Change tool descriptions
   - Add new tools to the `TOOLS` list
   - Modify the logic in `handle_tool_call()`

2. **Save the file and observe the output:**
   ```
   📝 File modify: server.py
   🔄 File change detected, restarting server...
   🛑 Killing server process 12345...
   ✅ Server process 12345 terminated
   🚀 Starting MCP server...
   ✅ Server started with PID: 12346
   📢 Sent tool change notification with X tools
   ✅ Server restart complete
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
      "command": "mcpmon",
      "args": ["python", "/path/to/claude-live-reload/examples/python/server.py"]
    }
  }
}
```

## Integration with MCP Inspector

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector mcpmon python server.py
```

## Advanced Usage

**With virtual environment:**
```bash
# Activate your venv first, then run mcpmon
source venv/bin/activate
mcpmon python server.py
```

**With module syntax:**
```bash
mcpmon python -m my_mcp_server
```

**With arguments:**
```bash
mcpmon python server.py --port 3000 --debug
```

**With environment variables:**
```bash
API_KEY=your-key mcpmon python server.py
```

## Troubleshooting

**Python not found?**
```bash
# Use full Python path
mcpmon /usr/bin/python3 server.py

# Or specify Python version
mcpmon python3 server.py
```

**Want verbose logging?**
```bash
MCPMON_VERBOSE=1 mcpmon python server.py
```

**Server crashes on startup?**
```bash
# Test Python server directly first
python server.py

# Check for syntax errors or missing dependencies
```