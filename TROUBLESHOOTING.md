# Troubleshooting Guide

## Common Issues and Solutions

### 1. Server Won't Start

**Symptom**: Error message "mcpmon command not found" or "no file to watch detected"

**Solution**:

```bash
# Install mcpmon globally
npm install -g mcpmon

# Or use with explicit file watching
MCPMON_WATCH=server.js mcpmon node server.js
```

### 2. No Hot Reload Happening

**Symptom**: File changes don't trigger server restart

**Check**:

- Look for the "👀 Watching:" log message - is it watching the right file?
- Try manually saving the file again
- Check if the file path is absolute (not relative)

**Solution**:

```bash
# Explicitly set the file to watch
MCPMON_WATCH="/absolute/path/to/your/server.js" mcpmon node server.js

# Or enable verbose logging to see what's being watched
MCPMON_VERBOSE=1 mcpmon node server.js
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
# or for other runtimes
python -m your_server
# or
deno run --allow-all /path/to/your/server.ts
```

### 4. Messages Lost During Restart

**Symptom**: Client operations fail during hot reload

**Check**: Look for "📦 Buffered message during restart" in logs

**Solution**: Increase restart delay if your server needs more startup time:

```bash
# Increase restart delay to 2 seconds
MCPMON_DELAY=2000 mcpmon node server.js
```

### 5. Tool Updates Not Received

**Symptom**: Claude doesn't see new tools after server changes

**Check**:

- Look for "📢 Sent tool change notification" in logs
- Ensure your server implements the `tools/list` method
- Check if tools are actually changing

### 6. Installation Issues

**Symptom**: "mcpmon: command not found" or installation errors

**Solution**: Ensure the package is properly installed:

```bash
# For global installation
npm install -g mcpmon

# Or use with npx
npx mcpmon node server.js

# For development
npm install && npm run build && npm link
```

### 7. Node.js Version Compatibility

**Symptom**: "ReadableStream is not defined" or "Cannot find module 'node:fs'" errors

**Cause**: mcpmon requires Node.js 16+ but your system or MCP client is using an older version

**Solutions**:

1. **Use setup command** (recommended):
   ```bash
   # Automatically detects and uses modern Node.js
   mcpmon setup my-server
   ```

2. **Manual fix for Claude Desktop**:
   ```json
   {
     "mcpServers": {
       "my-server": {
         "command": "/Users/username/.nvm/versions/node/v20.12.2/bin/node",
         "args": ["/usr/local/bin/mcpmon", "node", "server.js"]
       }
     }
   }
   ```

3. **Check Node.js version**:
   ```bash
   # Check your default version
   node --version
   
   # List available nvm versions
   nvm list
   
   # Use modern version
   nvm use 20
   ```

**For Claude Desktop users**: The setup command automatically handles this by detecting your latest Node.js version and configuring mcpmon to use it.

### 8. Claude Desktop Schema Changes

**Symptom**: New tools or resources not visible in Claude after hot-reload

**Solution**: 
1. Go to Claude Desktop Settings → Features → Model Context Protocol
2. Toggle your server **off**, then back **on**
3. No need to restart Claude Desktop!

**Note**: Code changes are handled automatically by hot-reload. Only schema changes (new tools/resources) require the toggle.

### 9. Process Won't Die

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

### 10. GitHub Actions Test Failures

**Symptom**: Tests fail in GitHub Actions with "log too large" errors

**Cause**: The proxy outputs console.error logs during normal operation which can make CI logs exceed size limits

**Solutions**:

1. **Tests run with `--silent` by default in CI** to suppress console output
2. **For debugging**, manually run the workflow with console logs enabled:
   ```
   GitHub Actions → Test workflow → Run workflow → ✓ Show console logs
   ```
3. **Local development is unaffected** - console logs show normally
4. **Environment differences**:
   - CI uses direct `mcpmon` command
   - Local uses full Node.js path from nvm
   - Setup tests handle both cases automatically

## Debug Mode

For verbose logging, enable debug output:

```bash
# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon node server.js

# Capture all output to file
MCPMON_VERBOSE=1 mcpmon node server.js 2>&1 | tee debug.log

# With timestamps
MCPMON_VERBOSE=1 mcpmon node server.js 2>&1 | ts '[%Y-%m-%d %H:%M:%S]' | tee debug.log
```

## Getting Help

1. Check the logs first - they're designed to be helpful!
2. Run the test suite to verify your setup: `npm test`
3. File an issue with:
   - Your .env configuration (without secrets)
   - The full debug log
   - Your server's basic structure

## Performance Tips

1. **Restart Delay**: Default is 1000ms. Increase for large servers:
   ```bash
   MCPMON_DELAY=2000 mcpmon node server.js
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

# 2. Run with mcpmon
MCPMON_VERBOSE=1 mcpmon node test-server.js
```

You should see:

- 🔧 mcpmon starting...
- 📟 Command: node test-server.js  
- 👀 Watching: test-server.js
- 🚀 Starting MCP server...
- ✅ Server started
