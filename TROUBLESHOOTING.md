# Troubleshooting Guide

## Common Issues and Solutions

### 1. Server Won't Start

**Symptom**: Error message "MCP_SERVER_COMMAND environment variable is required"

**Solution**:

```bash
# Make sure you've copied and configured .env
cp .env.example .env
# Edit .env with your server details
```

### 2. No Hot Reload Happening

**Symptom**: File changes don't trigger server restart

**Check**:

- Look for the "👀 Watching:" log message - is it watching the right file?
- Try manually saving the file again
- Check if the file path is absolute (not relative)

**Solution**:

```env
# Explicitly set the file to watch
MCP_WATCH_FILE="/absolute/path/to/your/server.js"
```

### 3. "Server exited unexpectedly"

**Common Causes**:

1. Your server has a syntax error
2. Missing dependencies
3. Wrong command/args in .env

**Debug Steps**:

```bash
# Test your server directly without the proxy
node /path/to/your/server.js
# or
deno run --allow-all /path/to/your/server.ts
```

### 4. Messages Lost During Restart

**Symptom**: Client operations fail during hot reload

**Check**: Look for "📦 Buffered message during restart" in logs

**Solution**: Increase restart delay if your server needs more startup time:

```env
MCP_RESTART_DELAY=1000  # Milliseconds
```

### 5. Tool Updates Not Received

**Symptom**: Claude doesn't see new tools after server changes

**Check**:

- Look for "📢 Sent tool change notification" in logs
- Ensure your server implements the `tools/list` method
- Check if tools are actually changing

### 6. Permission Errors

**Symptom**: "Requires read access" or similar Deno errors

**Solution**: Ensure all required permissions are granted:

```bash
deno run --allow-env --allow-read --allow-run src/main.ts
```

### 7. Process Won't Die

**Symptom**: Old server processes keep running

**Check**:

```bash
# Find lingering processes
ps aux | grep "your-server"
```

**Solution**: The proxy tries SIGTERM then SIGKILL. If processes still linger, you may need to handle signals in your server:

```javascript
// In your MCP server
process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down...");
  process.exit(0);
});
```

## Debug Mode

For verbose logging, run with debug output:

```bash
# Capture all output
deno task dev 2>&1 | tee debug.log

# With timestamps
deno task dev 2>&1 | ts '[%Y-%m-%d %H:%M:%S]' | tee debug.log
```

## Getting Help

1. Check the logs first - they're designed to be helpful!
2. Run the test suite to verify your setup: `deno task test`
3. File an issue with:
   - Your .env configuration (without secrets)
   - The full debug log
   - Your server's basic structure

## Performance Tips

1. **Restart Delay**: Default is 300ms. Increase for large servers:
   ```env
   MCP_RESTART_DELAY=1000
   ```

2. **File Watching**: Only watches one file by default. For multi-file projects, watch the main entry point that imports others.

3. **Memory**: The proxy itself is lightweight. If you see memory issues, it's likely your server.

## Testing Your Setup

Run this simple test to verify everything works:

```bash
# 1. Create a test server
cat > test-server.js << 'EOF'
#!/usr/bin/env node
console.log('{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}');
process.stdin.on('data', (data) => {
  const msg = JSON.parse(data.toString().trim());
  if (msg.method === 'tools/list') {
    console.log(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { tools: [] }
    }));
  }
});
EOF

# 2. Configure
echo 'MCP_SERVER_COMMAND="node"' > .env
echo 'MCP_SERVER_ARGS="'$(pwd)'/test-server.js"' >> .env

# 3. Run
deno task dev
```

You should see:

- 🚀 Starting MCP Server HMR
- ✅ Server started
- 👀 Watching: test-server.js
