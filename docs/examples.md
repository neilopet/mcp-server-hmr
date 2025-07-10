# Examples and Use Cases

> **Quick Links:** [← Configuration](configuration.md) | [← CLI Guide](cli.md) | [← README](../README.md) | [Docker →](docker.md) | [Extensions →](extension-development.md)

This comprehensive guide provides practical examples for using mcpmon across different development scenarios, from quick start patterns to complex production deployments.

## Table of Contents

1. [Quick Start Examples](#quick-start-examples)
2. [Development Workflows](#development-workflows)
3. [Production Scenarios](#production-scenarios)
4. [Integration Examples](#integration-examples)
5. [Troubleshooting Examples](#troubleshooting-examples)

## Quick Start Examples

### Basic Usage Patterns

```bash
# Basic Node.js server hot-reload
mcpmon node server.js

# Python server with auto-detection
mcpmon python server.py

# Deno server with permissions
mcpmon deno run --allow-all server.ts

# With MCP Inspector for immediate testing
npx @modelcontextprotocol/inspector mcpmon node server.js
```

### Auto-Detection Examples

mcpmon automatically detects files to watch based on your command arguments:

```bash
# Auto-detects files to watch from command arguments
mcpmon node server.js                    # Watches: server.js
mcpmon python app.py --config config.json # Watches: app.py, config.json
mcpmon deno run --allow-all main.ts       # Watches: main.ts

# Auto-detects Node.js version for compatibility (setup command)
mcpmon setup my-server                    # Uses latest compatible Node.js

# Auto-detects project structure and dependencies
mcpmon npm start                          # Watches: package.json, package-lock.json
mcpmon yarn dev                           # Watches: package.json, yarn.lock
```

### Framework Auto-Detection

```bash
# Package.json detection
mcpmon npm start                          # Auto-watches: package.json, package-lock.json, src/
mcpmon yarn dev                           # Auto-watches: package.json, yarn.lock, src/

# Framework detection
mcpmon next dev                           # Auto-watches: Next.js specific files
mcpmon vite build                         # Auto-watches: Vite configuration files

# Language-specific detection
mcpmon python -m uvicorn app:main        # Auto-watches: *.py, requirements.txt
mcpmon cargo run                          # Auto-watches: Cargo.toml, src/
mcpmon go run main.go                     # Auto-watches: *.go, go.mod
```

### Setup Command for Existing Servers

**Easiest way:** Use the automatic setup command for existing servers:

```bash
# Setup hot-reload for an existing server
mcpmon setup my-server

# Setup all stdio servers for hot-reload
mcpmon setup --all

# List available servers
mcpmon setup --list

# Restore original config if needed
mcpmon setup --restore
```

## Development Workflows

### Extension Usage

#### Large Response Handler Extension

```bash
# Enable large response handling for data-heavy MCP servers
mcpmon --enable-extension large-response-handler \
       --extension-config '{"threshold":25000,"format":"parquet"}' \
       python data-server.py

# Configure custom data directory and lower threshold
mcpmon --enable-extension large-response-handler \
       --extensions-data-dir ./session-data \
       --extension-config '{"threshold":15000,"enableDuckDB":true}' \
       node analytics-server.js

# Access large response handler tools
# Automatically adds: mcpmon_analyze-with-duckdb, mcpmon_list-saved-datasets
```

#### Request Logging Extension

```bash
# Enable request/response logging for debugging
mcpmon --enable-extension request-logger \
       --extension-config '{"logLevel":"debug","logFile":"./requests.log"}' \
       node server.js

# Production logging with structured output
mcpmon --enable-extension request-logger \
       --extension-config '{"format":"json","includeTimestamp":true}' \
       --extensions-data-dir /var/log/mcpmon \
       python production-server.py
```

#### Multiple Extensions with Configuration

```bash
# Development setup with comprehensive monitoring
mcpmon --enable-extension large-response-handler \
       --enable-extension request-logger \
       --enable-extension metrics \
       --extension-config '{
         "threshold":20000,
         "logLevel":"info",
         "metricsPort":9090,
         "enableNotifications":true
       }' \
       --extensions-data-dir ./dev-data \
       node server.js

# Production monitoring stack
MCPMON_EXTENSIONS_ENABLED="large-response-handler,metrics" \
MCPMON_EXTENSIONS_DIR="/var/lib/mcpmon" \
mcpmon --extension-config '{
  "threshold":50000,
  "metricsPort":9090,
  "prometheusEndpoint":"/metrics"
}' \
node production-server.js
```

### Framework Integration

#### Next.js MCP Server Development

```bash
# Next.js MCP server development
MCPMON_WATCH="pages/api/mcp/,lib/mcp/,next.config.js" \
mcpmon --enable-extension large-response-handler \
       npm run dev
```

#### FastAPI Python Server

```bash
# FastAPI Python server with auto-reload
MCPMON_WATCH="app/,requirements.txt,pyproject.toml" \
MCPMON_EXTENSIONS_DIR="./fastapi-data" \
mcpmon --enable-extension request-logger \
       uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### Deno MCP Server

```bash
# Deno MCP server with import maps
MCPMON_WATCH="src/,import_map.json,deno.json" \
mcpmon deno run \
  --allow-all \
  --import-map=import_map.json \
  src/server.ts
```

### Docker Development

#### Basic Docker Integration

```bash
# Simple containerized MCP server with hot-reload
mcpmon docker run -d \
  --name my-mcp-server \
  -p 3000:3000 \
  my-server:latest

# Development mode with volume mounting
mcpmon docker run -d \
  --name dev-server \
  -v $(pwd)/src:/app/src \
  -v $(pwd)/config:/app/config \
  -e NODE_ENV=development \
  my-server:dev
```

#### Docker Compose with mcpmon

```bash
# Hot-reload for Docker Compose services
MCPMON_WATCH="./src,./config,docker-compose.yml" \
mcpmon docker compose up my-service

# Multi-service development environment
mcpmon docker compose -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up mcp-server redis postgres

# Production deployment with monitoring
MCPMON_EXTENSIONS_ENABLED="metrics,large-response-handler" \
MCPMON_DOCKER_CLEANUP=true \
mcpmon docker compose -f docker-compose.prod.yml up
```

#### Advanced Docker Configuration

```bash
# Container with comprehensive environment setup
mcpmon docker run -d \
  --name production-mcp \
  -p 3000:3000 \
  -e API_KEY=secret \
  -e DATABASE_URL=postgres://localhost/mcp \
  -e LOG_LEVEL=info \
  -e REDIS_URL=redis://localhost:6379 \
  --restart unless-stopped \
  --health-cmd="curl -f http://localhost:3000/health || exit 1" \
  --health-interval=30s \
  my-server:latest

# Development container with debugging enabled
MCPMON_VERBOSE=true \
mcpmon docker run -d \
  --name debug-server \
  -p 3000:3000 \
  -p 9229:9229 \
  -v $(pwd):/app \
  -e NODE_ENV=development \
  -e DEBUG=mcp:* \
  node:18-alpine node --inspect=0.0.0.0:9229 server.js
```

#### Container Cleanup and Management

```bash
# Interactive cleanup of orphaned containers
mcpmon --cleanup

# Force cleanup without confirmation
mcpmon --cleanup --force

# Cleanup with detailed logging
mcpmon --cleanup --verbose --force

# Check container status and labels
docker ps --filter label=mcpmon.managed=true \
  --format "table {{.ID}}\t{{.Names}}\t{{.Label \"mcpmon.session\"}}"
```

## Production Scenarios

### High-Performance Setup

```bash
# Load-balanced production environment
MCPMON_LOG_FILE="/var/log/mcpmon/server.log" \
MCPMON_BUFFER_SIZE=4194304 \
MCPMON_MAX_RETRIES=5 \
MCPMON_GRACEFUL_SHUTDOWN=15000 \
MAX_MCP_OUTPUT_TOKENS=25000 \
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       --extension-config '{
         "threshold":100000,
         "metricsPort":9090,
         "prometheusLabels":{"service":"mcp-server","env":"prod"}
       }' \
       node --max-old-space-size=4096 server.js

# Cluster mode with PM2 integration
MCPMON_WATCH="src/,ecosystem.config.js" \
mcpmon pm2 start ecosystem.config.js --env production
```

### Multi-Language Development Environment

```bash
# Node.js server with Python data processing
MCPMON_WATCH="server.js,data-processor.py,config/" \
MCPMON_EXTENSIONS_ENABLED="large-response-handler,request-logger" \
mcpmon --extension-config '{
  "threshold":30000,
  "logLevel":"debug",
  "pythonPath":"/usr/local/bin/python3"
}' \
node hybrid-server.js

# Microservices development with shared configuration
MCPMON_WATCH="services/,shared/,docker-compose.yml" \
MCPMON_DELAY=2000 \
mcpmon docker compose up \
  user-service \
  data-service \
  api-gateway
```

### CI/CD Integration

```bash
# GitHub Actions testing environment
MCPMON_WATCH="src/,tests/,package.json" \
MCPMON_DELAY=100 \
MCPMON_LOG_LEVEL=error \
mcpmon --enable-extension request-logger \
       --dry-run \
       npm test

# Docker-based CI pipeline
mcpmon docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  -e CI=true \
  node:18-alpine npm run test:integration
```

### Team Collaboration

```bash
# Shared development server
MCPMON_VERBOSE=true \
MCPMON_WATCH="src/,shared/,team-config.json" \
MCPMON_EXTENSIONS_DIR="/shared/mcpmon-data" \
mcpmon --enable-extension large-response-handler \
       --enable-extension request-logger \
       --extension-config '{
         "threshold":20000,
         "logFile":"/shared/logs/requests.log",
         "teamMode":true
       }' \
       node shared-server.js

# Individual developer setup
MCPMON_WATCH="src/,personal-config/" \
MCPMON_EXTENSIONS_DIR="~/.mcpmon/$(whoami)" \
mcpmon --enable-extension large-response-handler \
       node personal-server.js
```

### Production Monitoring and Alerting

```bash
# Production server with comprehensive monitoring
MCPMON_LOG_FILE="/var/log/mcpmon/production.log" \
MCPMON_EXTENSIONS_DIR="/var/lib/mcpmon" \
MCPMON_WATCH="src/,config/production.json" \
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       --extension-config '{
         "threshold":75000,
         "metricsPort":9090,
         "alerting": {
           "webhookUrl":"https://alerts.company.com/webhook",
           "thresholds": {
             "responseTime": 5000,
             "errorRate": 0.05,
             "memoryUsage": 0.8
           }
         }
       }' \
       node production-server.js

# Health check integration
mcpmon --enable-extension metrics \
       docker run -d \
       --health-cmd="curl -f http://localhost:9090/health" \
       --health-interval=10s \
       --health-retries=3 \
       my-server:latest
```

### Multi-Environment Configuration Management

```bash
# Development environment
NODE_ENV=development \
MCPMON_WATCH="src/,config/dev.json" \
MCPMON_DELAY=500 \
mcpmon --enable-extension large-response-handler \
       --enable-extension request-logger \
       node server.js

# Staging environment
NODE_ENV=staging \
MCPMON_WATCH="src/,config/staging.json" \
MCPMON_LOG_FILE="/var/log/mcpmon/staging.log" \
mcpmon --enable-extension metrics \
       --extension-config '{"threshold":40000}' \
       docker compose -f docker-compose.staging.yml up

# Production environment
NODE_ENV=production \
MCPMON_WATCH="src/,config/production.json" \
MCPMON_LOG_FILE="/var/log/mcpmon/production.log" \
MCPMON_EXTENSIONS_DIR="/var/lib/mcpmon" \
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       --extension-config '{
         "threshold":100000,
         "metricsPort":9090,
         "persistence":true
       }' \
       node cluster-server.js
```

## Integration Examples

### MCP Tools

#### MCP Inspector Integration

```bash
# Basic inspector usage
npx @modelcontextprotocol/inspector mcpmon node server.js

# With enhanced configuration
MCPMON_VERBOSE=true \
API_KEY=your-key \
npx @modelcontextprotocol/inspector \
mcpmon --enable-extension request-logger node server.js

# Development mode with extensions
mcpmon --enable-extension large-response-handler \
       --extension-config '{"threshold":20000}' \
       node server.js | \
npx @modelcontextprotocol/inspector
```

#### Advanced Tool Integration

```bash
# With debugging and monitoring
MCPMON_LOG_LEVEL=debug \
mcpmon --enable-extension metrics \
       --enable-extension request-logger \
       node --inspect=0.0.0.0:9229 server.js

# Performance profiling setup
MCPMON_DELAY=0 \
MAX_MCP_OUTPUT_TOKENS=50000 \
mcpmon --enable-extension large-response-handler \
       node --prof server.js
```

#### MCP Inspector with Custom Extensions

```bash
# MCP Inspector with custom extensions
MCPMON_VERBOSE=true \
npx @modelcontextprotocol/inspector \
mcpmon --enable-extension large-response-handler \
       --enable-extension request-logger \
       --extension-config '{"threshold":15000,"logLevel":"debug"}' \
       node server.js
```

### External Tools

#### Grafana Metrics Integration

```bash
# Grafana metrics integration
mcpmon --enable-extension metrics \
       --extension-config '{
         "metricsPort":9090,
         "prometheusEndpoint":"/metrics",
         "grafanaDashboard":true
       }' \
       docker run -d \
       -p 3000:3000 \
       -p 9090:9090 \
       my-server:latest
```

#### Custom Notification Integration

```bash
# Custom notification integration
mcpmon --enable-extension request-logger \
       --extension-config '{
         "webhookUrl":"https://hooks.slack.com/services/...",
         "notificationThreshold":"error",
         "customFields":{"team":"backend","service":"mcp"}
       }' \
       node server.js
```

### Claude Code and Claude Desktop

#### Manual Configuration Examples

**Claude Code** (`~/.claude_code_config`):
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "server.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "my-server": {
      "command": "/Users/username/.nvm/versions/node/v22.15.0/bin/node",
      "args": ["/usr/local/bin/mcpmon", "python", "server.py"],
      "env": {
        "PYTHONPATH": "/path/to/your/modules"
      }
    }
  }
}
```

#### Hot-Reload Tips

After setting up hot-reload:

- **Code changes**: Your server automatically restarts - no action needed!
- **Schema changes** (new tools/resources): Toggle the MCP server off/on in Claude Desktop settings
  - Go to Claude Desktop Settings → Features → Model Context Protocol
  - Toggle your server off, then back on
  - **No restart needed** - just the toggle!
- **Config changes**: Restart Claude Desktop only if you modify the configuration file directly

> **Pro tip**: For the best development experience, make code changes first, then schema changes. Claude Desktop will pick up tool calls from the latest hot-reloaded code even after schema updates!

## Troubleshooting Examples

### Debugging with Verbose Logging

```bash
# Enable verbose logging to see what's happening
MCPMON_VERBOSE=1 mcpmon node server.js

# Advanced debugging with log file
MCPMON_VERBOSE=1 \
MCPMON_LOG_FILE="./debug.log" \
MCPMON_LOG_LEVEL=debug \
mcpmon node server.js
```

### Docker Troubleshooting

```bash
# Manual Container Inspection
# Check all mcpmon-managed containers
docker ps -a --filter label=mcpmon.managed=true

# Inspect specific container labels
docker inspect <container-id> --format='{{range $key, $value := .Config.Labels}}{{if eq $key "mcpmon.session"}}Session: {{$value}}{{end}}{{if eq $key "mcpmon.pid"}}PID: {{$value}}{{end}}{{if eq $key "mcpmon.started"}}Started: {{$value}}{{end}}{{end}}'

# Find containers for specific session
docker ps --filter label=mcpmon.session=<session-id>
```

### Finding Orphaned Containers

```bash
# List all mcpmon containers with process status
docker ps --filter label=mcpmon.managed=true --format "table {{.ID}}\t{{.Names}}\t{{.Label \"mcpmon.pid\"}}\t{{.Status}}"

# Check if mcpmon process is still running
ps aux | grep mcpmon | grep <pid>
```

### Manual Cleanup Commands

```bash
# Stop specific orphaned container
docker stop <container-id>

# Force kill if stop fails
docker kill <container-id>

# Remove stopped containers
docker container prune

# Stop all mcpmon containers (emergency cleanup)
docker stop $(docker ps -q --filter label=mcpmon.managed=true)
```

### Environment Variable Configuration

```bash
# Use environment variables for complex configurations
MCPMON_WATCH="src/,config/" \
MCPMON_DELAY=2000 \
MCPMON_VERBOSE=1 \
MCPMON_EXTENSIONS_DIR=./docker-data \
MAX_MCP_OUTPUT_TOKENS=10000 \
mcpmon docker run -d my-server:latest

# Combined mcpmon and container configuration
MCPMON_VERBOSE=1 mcpmon docker run -d \
  -e NODE_ENV=development \
  -e API_KEY=secret \
  -e LOG_LEVEL=debug \
  my-server:latest
```

### Common Issues and Solutions

1. **"ReadableStream is not defined"?** mcpmon requires Node.js 16+. Use `mcpmon setup` to auto-detect modern Node.js versions
2. **Server won't start?** Check the error messages for missing dependencies
3. **No hot reload?** Verify your server file is being detected in the logs
4. **Schema changes not visible?** Toggle your MCP server off/on in Claude Desktop settings
5. **Container won't stop**: Try `docker kill` instead of `docker stop`
6. **Permission errors**: Ensure Docker daemon is running and user has permissions
7. **Stale containers**: Use `mcpmon --cleanup --force` to remove orphaned containers
8. **Process still running**: Check if mcpmon process crashed with `ps aux | grep mcpmon`

For more detailed troubleshooting, see our [Troubleshooting Guide](../TROUBLESHOOTING.md).

---

**Like nodemon? You'll love mcpmon.** Simple, fast, and reliable hot-reload for MCP development.