# Command-Line Interface

> **Quick Links:** [← README](../README.md) | [Configuration →](configuration.md) | [Examples →](examples.md) | [Docker →](docker.md)

## Overview

mcpmon provides a powerful command-line interface with auto-detection capabilities, extensive configuration options, and environment variable support for seamless MCP development. The CLI is designed with a nodemon-like interface that's both simple to use and highly configurable.

## Auto-Detection Features

mcpmon automatically detects and configures optimal settings for your development environment:

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

### Advanced Auto-Detection

mcpmon's enhanced auto-detection provides intelligent defaults based on your project structure:

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

## Command-Line Options

### Core Options

```bash
# Enable verbose logging
mcpmon --verbose node server.js
mcpmon -v python server.py

# Set custom restart delay (milliseconds)
mcpmon --delay 2000 node server.js
mcpmon -d 500 python server.py

# Override watch targets
mcpmon --watch "src/,config/" node server.js
mcpmon -w "*.py,*.json" python server.py

# Show version information
mcpmon --version
mcpmon -V

# Display help
mcpmon --help
mcpmon -h
```

### Extension Management

```bash
# List available extensions
mcpmon --list-extensions

# Enable specific extensions
mcpmon --enable-extension large-response-handler node server.js
mcpmon --enable-extension request-logger --enable-extension metrics python server.py

# Disable extensions
mcpmon --disable-extension large-response-handler node server.js

# Configure extension data directory
mcpmon --extensions-data-dir ./session-data node server.js

# Pass JSON configuration to extensions
mcpmon --extension-config '{"threshold":25000,"format":"parquet"}' node server.js
```

### Docker Integration

```bash
# Container cleanup and management
mcpmon --cleanup                          # Interactive cleanup of orphaned containers
mcpmon --cleanup --force                  # Force cleanup without confirmation
mcpmon --cleanup --verbose                # Detailed cleanup logging

# Docker command passthrough with auto-labeling
mcpmon docker run -d my-server:latest     # Auto-adds session tracking labels
mcpmon docker compose up my-service       # Manages compose services with hot-reload
```

### Setup and Configuration

```bash
# Server setup and management
mcpmon setup my-server                    # Setup hot-reload for existing server
mcpmon setup --all                        # Setup all stdio servers
mcpmon setup --list                       # List available servers
mcpmon setup --restore                    # Restore original configurations

# Development mode options
mcpmon --dry-run node server.js           # Preview actions without execution
mcpmon --no-auto-restart node server.js   # Disable automatic restarts
```

## Environment Variables

mcpmon supports comprehensive environment variable configuration for fine-tuned control:

### Core Behavior Variables

```bash
# File watching configuration
MCPMON_WATCH="src/,config/,*.json"        # Override auto-detected watch targets
MCPMON_IGNORE="node_modules/,dist/"       # Ignore specific patterns
MCPMON_EXTENSIONS=".js,.ts,.py,.json"     # File extensions to monitor

# Timing and performance
MCPMON_DELAY=1000                         # Restart delay in milliseconds
MCPMON_DEBOUNCE=250                       # File change debounce time
MCPMON_TIMEOUT=30000                      # Server startup timeout

# Logging and debugging
MCPMON_VERBOSE=true                       # Enable verbose logging
MCPMON_LOG_LEVEL=debug                    # Set log level (error, warn, info, debug)
MCPMON_LOG_FILE="./mcpmon.log"            # Log to file

# Extension system
MCPMON_EXTENSIONS_DIR="./mcpmon-data"     # Extension data directory
MCPMON_EXTENSIONS_ENABLED="ext1,ext2"     # Comma-separated list of enabled extensions
MCPMON_EXTENSIONS_DISABLED="ext3"         # Comma-separated list of disabled extensions
```

### MCP Protocol Variables

```bash
# Response handling
MAX_MCP_OUTPUT_TOKENS=6250                # Large response threshold (≈25KB)
MCPMON_BUFFER_SIZE=1048576               # Message buffer size in bytes
MCPMON_MAX_RETRIES=3                     # Maximum retry attempts

# Connection management
MCPMON_CONNECT_TIMEOUT=5000              # Initial connection timeout
MCPMON_KEEPALIVE_INTERVAL=30000          # Keep-alive ping interval
MCPMON_GRACEFUL_SHUTDOWN=10000           # Graceful shutdown timeout
```

### Docker-Specific Variables

```bash
# Container management
MCPMON_DOCKER_CLEANUP=true               # Auto-cleanup orphaned containers
MCPMON_DOCKER_TIMEOUT=30000              # Container operation timeout
MCPMON_DOCKER_LABELS="custom=value"      # Additional container labels

# Session management
MCPMON_SESSION_ID="custom-session"       # Override auto-generated session ID
MCPMON_SESSION_PERSIST=true              # Persist session data across restarts
```

## Usage Examples

### Basic Usage

```bash
# Simple server monitoring
mcpmon node server.js
mcpmon python server.py
mcpmon deno run --allow-all server.ts

# With MCP Inspector
npx @modelcontextprotocol/inspector mcpmon node server.js

# Using setup command for existing servers
mcpmon setup my-server
```

### Extension Usage

```bash
# Enable large response handling for data-heavy MCP servers
mcpmon --enable-extension large-response-handler \
       --extension-config '{"threshold":25000,"format":"parquet"}' \
       python data-server.py

# Enable request/response logging for debugging
mcpmon --enable-extension request-logger \
       --extension-config '{"logLevel":"debug","logFile":"./requests.log"}' \
       node server.js

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
```

### Docker Integration

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

# Hot-reload for Docker Compose services
MCPMON_WATCH="./src,./config,docker-compose.yml" \
mcpmon docker compose up my-service

# Container cleanup
mcpmon --cleanup --force
```

### Environment Variable Usage

```bash
# Override watch targets
MCPMON_WATCH="src/,config/" mcpmon node server.js

# Enable verbose logging
MCPMON_VERBOSE=true mcpmon python server.py

# Configure extensions via environment
MCPMON_EXTENSIONS_ENABLED="large-response-handler,request-logger" \
MCPMON_EXTENSIONS_DIR="./session-data" \
mcpmon node server.js

# High-performance production setup
MCPMON_LOG_FILE="/var/log/mcpmon/server.log" \
MCPMON_BUFFER_SIZE=4194304 \
MCPMON_MAX_RETRIES=5 \
MCPMON_GRACEFUL_SHUTDOWN=15000 \
MAX_MCP_OUTPUT_TOKENS=25000 \
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       node --max-old-space-size=4096 server.js
```

### Framework-Specific Usage

```bash
# Next.js MCP server development
MCPMON_WATCH="pages/api/mcp/,lib/mcp/,next.config.js" \
mcpmon --enable-extension large-response-handler \
       npm run dev

# FastAPI Python server with auto-reload
MCPMON_WATCH="app/,requirements.txt,pyproject.toml" \
MCPMON_EXTENSIONS_DIR="./fastapi-data" \
mcpmon --enable-extension request-logger \
       uvicorn app.main:app --host 0.0.0.0 --port 8000

# Deno MCP server with import maps
MCPMON_WATCH="src/,import_map.json,deno.json" \
mcpmon deno run \
  --allow-all \
  --import-map=import_map.json \
  src/server.ts
```

### Advanced Configuration

```bash
# Multi-language development environment
MCPMON_WATCH="server.js,data-processor.py,config/" \
MCPMON_EXTENSIONS_ENABLED="large-response-handler,request-logger" \
mcpmon --extension-config '{
  "threshold":30000,
  "logLevel":"debug",
  "pythonPath":"/usr/local/bin/python3"
}' \
node hybrid-server.js

# Override auto-detection with manual additions
MCPMON_WATCH="auto,custom-dir/,settings.yaml" mcpmon python server.py

# Combine with ignore patterns
mcpmon --watch "src/" --ignore "*.test.*,dist/" node server.js
```

## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| `mcpmon node server.js` | Start server with hot-reload |
| `mcpmon --verbose node server.js` | Enable verbose logging |
| `mcpmon setup my-server` | Setup existing server for hot-reload |
| `mcpmon --list-extensions` | List available extensions |
| `mcpmon --cleanup` | Clean up orphaned Docker containers |

### Common Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCPMON_WATCH` | auto-detected | Files/directories to watch |
| `MCPMON_VERBOSE` | false | Enable verbose logging |
| `MCPMON_DELAY` | 1000 | Restart delay in milliseconds |
| `MAX_MCP_OUTPUT_TOKENS` | 6250 | Large response threshold |
| `MCPMON_EXTENSIONS_DIR` | ./mcpmon-data | Extension data directory |

### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid command-line arguments |
| 3 | Server startup failure |
| 4 | File watching error |

For more detailed information, see the [API Documentation](api.md) and [Extension Development Guide](extension-development.md).