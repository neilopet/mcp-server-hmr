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

### v0.4.0 - HTTP/SSE Tool Discovery (Q1 2025)

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

### v0.5.0 - Enhanced Authentication Support (Q2 2025)

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

### v0.6.0 - Package Monitoring Support (Q2 2025)

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

### v0.7.0 - Performance Optimizations (Q3 2025)

**Goal**: Scale to larger codebases and more complex monitoring scenarios

**Features**:
- Efficient file watching for monorepos (10k+ files)
- Parallel tool discovery for multiple endpoints
- Caching layer for HTTP responses
- Configurable health checks to avoid polling dead servers

### v0.8.0 - Developer Experience (Q3 2025)

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

1. Security improvements
2. Performance optimizations  
3. Developer experience enhancements
4. New transport support (in that order)

## Version Support

- **LTS Versions**: Every 1.0, 2.0, etc. (2 year support)
- **Regular Versions**: 6 month support
- **Security Patches**: Backported to all supported versions

---

This roadmap is subject to change based on community feedback and project priorities. File issues for feature requests or concerns about planned features.