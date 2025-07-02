# mcpmon Development Roadmap

## Overview

This roadmap outlines planned features and improvements for mcpmon, focusing on maintaining simplicity while expanding capabilities for modern MCP development workflows.

## Current Status (v0.3.x)

- ✅ Core hot-reload functionality for stdio-based MCP servers
- ✅ Zero-configuration with auto-detection
- ✅ Cross-platform support (Windows, macOS, Linux)
- ✅ Library usage support with generic interfaces
- ✅ Comprehensive test coverage

## Upcoming Releases

### v0.4.0 - MCP Protocol Integration (Q1 2025)

**Goal**: Transform mcpmon into an active development assistant by exposing its internal state through native MCP Resources and Prompts

**Features**:

**MCP Resources** - Expose proxy internals as readable resources:
- `mcpmon://logs/proxy` - Proxy operational logs with timestamps
- `mcpmon://logs/server` - Captured server stdout/stderr
- `mcpmon://logs/server/{pid}` - Logs for specific server process
- `mcpmon://logs/combined` - Interleaved view with correlation IDs
- `mcpmon://config` - Current proxy configuration (sanitized)
- `mcpmon://stats` - Restart count, uptime, message counts (JSON format)
- `mcpmon://stats?format=json` - Queryable statistics endpoint
- `mcpmon://file-watch` - Active file watch patterns and last trigger times

**Resource Features**:
- Pagination support for large log files via cursor parameter
- MIME types: `text/plain` for logs, `application/json` for structured data
- Automatic log rotation and size limits (configurable)
- Sensitive data sanitization (tokens, passwords, API keys)

**MCP Prompts** - Interactive troubleshooting workflows:
- `debug_startup_failure` - Analyze why MCP server won't start
  - Arguments: `include_env` (boolean), `time_range` (string, e.g. "5m", "1h")
  - Embeds recent error logs as resources
- `analyze_restart_loop` - Diagnose continuous restart issues
  - Arguments: `threshold` (number of restarts), `time_window` (string)
  - Provides pattern analysis and common causes
- `check_file_watch` - Verify which files trigger restarts
  - Shows active patterns and recent trigger history
- `performance_analysis` - Analyze restart times and message latency
  - Arguments: `time_period` (string), `include_metrics` (boolean)
  - Returns statistical analysis with visualizations
- `fix_common_issues` - Auto-detect problems and suggest fixes
  - Reads logs, analyzes patterns, provides actionable solutions
- `configure_auth` - Help set up authentication for future HTTP monitoring
  - Arguments: `auth_type` (oauth2, bearer, mtls)

**Capability Integration**:
```json
{
  "capabilities": {
    "prompts": { "listChanged": true },
    "resources": { "listChanged": true },
    // Merged with proxied server capabilities
  }
}
```

**Message Interception Strategy**:
1. **Resources**:
   - Intercept `resources/list` → inject mcpmon resources + forward server resources
   - Intercept `resources/read` → handle `mcpmon://` URIs directly, forward others
   - Support pagination for large resources using cursor tokens

2. **Prompts**:
   - Intercept `prompts/list` → inject diagnostic prompts + forward server prompts
   - Intercept `prompts/get` → handle mcpmon prompts, forward others
   - Prompts can embed resources directly in responses

3. **Notifications**:
   - Emit `resources/list_changed` when server restarts (new stats/logs)
   - Emit `prompts/list_changed` if dynamic prompts are added

**Security Considerations**:
- Log sanitization removes secrets, tokens, and sensitive data
- Resources are read-only (no write operations)
- No token passthrough in exposed logs
- Configurable log retention and size limits
- Rate limiting on resource access

**Implementation Benefits**:
- **Native MCP integration** - Uses standard protocol features
- **Zero additional complexity** - No new transports or auth needed
- **In-context debugging** - Access logs without leaving Claude Code
- **Self-documenting** - The tool explains itself through MCP protocol
- **Embedded resources** - Prompts can include relevant logs directly

**Technical Approach**:
- Message interceptor for resources/prompts requests
- Circular buffer for log history (default 10MB, configurable)
- Log analyzer with pattern matching and heuristics
- ~3-4 days implementation (1.5 days resources, 2 days prompts, 0.5 days testing)

**Example Usage**:
```bash
# mcpmon exposes its own resources and prompts alongside server's
mcpmon node server.js

# In Claude Code:
# "Show me mcpmon://logs/server"
# "Read the last error from mcpmon://logs/server?level=error"
# "Run the debug_startup_failure prompt with include_env=true"
```

### v0.5.0 - HTTP/SSE Tool Discovery (Q2 2025)

**Goal**: Support monitoring of HTTP/SSE-based MCP servers without proxying their connections

**Features**:
- Monitor file changes and query HTTP/SSE endpoints for tool updates
- Send `notifications/tools/list_changed` to stdio-connected clients
- Maintain stdio connection to MCP client while monitoring HTTP servers

**Implementation**:
```bash
# Monitor HTTP server for tool changes
mcpmon --http http://localhost:3000/mcp --watch "src/**/*.js"

# Monitor SSE server
mcpmon --sse http://localhost:3000/sse --watch "server.js"
```

**Security Challenges**:
- **Authentication**: How to pass auth tokens/credentials to HTTP endpoints
  - Bearer tokens via `--auth-token` flag
  - Environment variable support `MCPMON_AUTH_TOKEN`
  - Config file for sensitive credentials `.mcpmon.auth.json` (gitignored)
- **Authorization**: Ensuring mcpmon has permission to access tool lists
  - Support standard auth headers (Authorization, X-API-Key)
  - OAuth2 token refresh handling
  - mTLS certificate support for enterprise environments
- **Security Best Practices**:
  - Never log authentication credentials
  - Secure credential storage (OS keychain integration?)
  - HTTPS-only by default for production endpoints
  - Warning when using HTTP in non-localhost scenarios

**Technical Approach**:
- Add `ToolDiscoveryClient` class with auth support
- Integrate with existing file watcher
- ~2-3 days core implementation + 2 days for security features

### v0.6.0 - Enhanced Authentication Support (Q2 2025)

**Goal**: Robust authentication for enterprise HTTP/SSE monitoring

**Features**:
- OS keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- OAuth2 device flow for CLI authentication
- Service account support with key rotation
- Encrypted credential cache with timeout

**Example**:
```bash
# First time setup
mcpmon auth login --provider github
# Opens browser for OAuth flow

# Subsequent uses automatically authenticate
mcpmon --http https://api.example.com/mcp --watch "src/**"
```

### v0.7.0 - Package Monitoring Support (Q3 2025)

**Goal**: Leverage generic interfaces for monitoring npm/PyPI/crates.io packages

**Features**:
- Monitor package registries for version updates
- Trigger tool refresh when dependencies update
- Support for private registries with authentication

**Example**:
```bash
# Monitor npm package for updates
mcpmon --npm @mycompany/mcp-tools --watch-interval 60s

# Monitor multiple sources
mcpmon --watch "src/**" --npm "@mycompany/*" --pypi "mcp-tools"
```

### v0.8.0 - Performance Optimizations (Q3 2025)

**Goal**: Scale to larger codebases and more complex monitoring scenarios

**Features**:
- Efficient file watching for monorepos (10k+ files)
- Parallel tool discovery for multiple endpoints
- Caching layer for HTTP responses
- Configurable health checks to avoid polling dead servers

### v0.9.0 - Developer Experience (Q4 2025)

**Goal**: Enhanced debugging and troubleshooting capabilities

**Features**:
- `--debug` mode with detailed HTTP request/response logging
- `mcpmon doctor` command for diagnosing configuration issues
- Integration with Chrome DevTools for HTTP traffic inspection
- Structured logging with JSON output option

### v1.0.0 - Production Ready (Q4 2025)

**Goal**: Enterprise-ready with stability guarantees

**Features**:
- Stable API with semantic versioning commitment
- Comprehensive security audit
- Performance benchmarks and guarantees
- Enterprise support documentation
- Migration guides from other tools

## Future Considerations

### Potential Features (Not Scheduled)

1. **WebSocket Support**
   - Similar to SSE but for bidirectional communication
   - Complex connection management during reloads

2. **Service Mesh Integration**
   - Envoy/Istio aware for cloud-native MCP servers
   - Automatic mTLS handling

3. **IDE Plugins**
   - VS Code extension for visual hot-reload status
   - IntelliJ IDEA plugin
   - Integrated debugging support

4. **Distributed Monitoring**
   - Monitor MCP servers across multiple machines
   - Centralized tool discovery service

5. **Plugin System**
   - Allow custom monitors (GraphQL, gRPC, etc.)
   - Community-contributed authentication providers

### Explicitly Not Planned

1. **Full HTTP/SSE Proxying**
   - Would require becoming a full HTTP proxy server
   - Dramatically increases complexity
   - Better served by existing tools (nginx, Envoy)

2. **Built-in MCP Server**
   - mcpmon remains a development tool, not a server
   - Focus on monitoring, not serving

3. **Production Process Management**
   - Leave this to PM2, systemd, etc.
   - mcpmon is for development, not production

## Security Principles

All features will follow these security principles:

1. **Secure by Default** - HTTPS required for non-localhost
2. **Principle of Least Privilege** - Only request necessary permissions
3. **No Credential Persistence** - Unless explicitly opted-in by user
4. **Transparent Security** - Clear documentation of security implications
5. **Regular Security Audits** - Before each major release

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute to these roadmap items. Priority will be given to:

1. Developer experience enhancements (MCP Resources/Prompts)
2. Security improvements
3. Performance optimizations  
4. New transport support (in that order)

## Version Support

- **LTS Versions**: Every 1.0, 2.0, etc. (2 year support)
- **Regular Versions**: 6 month support
- **Security Patches**: Backported to all supported versions

---

This roadmap is subject to change based on community feedback and project priorities. File issues for feature requests or concerns about planned features.