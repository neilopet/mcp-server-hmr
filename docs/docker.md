# Docker Container Management

> **Quick Links:** [← Examples](examples.md) | [← Configuration](configuration.md) | [← README](../README.md) | [Troubleshooting →](../TROUBLESHOOTING.md)

## Overview

mcpmon provides advanced Docker container management features that enable safe hot-reload for containerized MCP servers while preventing orphaned containers and resource leaks. The system uses session-based tracking and automatic label injection to ensure safe, isolated container management across multiple mcpmon instances.

## Container Tracking System

### Session-based Tracking

Each mcpmon instance creates a unique session ID and tracks only the Docker containers it manages:

- **Unique Session ID**: Every mcpmon instance generates a UUID-based session identifier
- **Container Isolation**: Each session only manages its own containers, preventing interference between multiple mcpmon instances
- **Safe Concurrent Usage**: Multiple mcpmon instances can run simultaneously without affecting each other's containers

### Container Labeling Scheme

mcpmon automatically injects Docker labels into `docker run` commands to track container ownership and lifecycle:

```bash
# Labels automatically added by mcpmon:
--label mcpmon.managed=true           # Identifies mcpmon-managed containers
--label mcpmon.session=<uuid>         # Unique session identifier  
--label mcpmon.pid=<pid>              # mcpmon process ID
--label mcpmon.started=<timestamp>    # Container start time
```

**Example usage:**
```bash
# Original command
mcpmon docker run -d my-mcp-server:latest

# Actual command executed (labels injected automatically)
docker run -d \
  --label mcpmon.managed=true \
  --label mcpmon.session=a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  --label mcpmon.pid=12345 \
  --label mcpmon.started=1672531200000 \
  my-mcp-server:latest
```

### Inspecting Containers

View mcpmon labels on running containers:

```bash
# Inspect specific container
docker inspect <container-id> | grep mcpmon

# Find all mcpmon-managed containers
docker ps --filter label=mcpmon.managed=true

# Show detailed label information
docker ps --filter label=mcpmon.managed=true --format "table {{.ID}}\t{{.Names}}\t{{.Label \"mcpmon.session\"}}\t{{.Label \"mcpmon.pid\"}}"
```

## Orphan Recovery

### Detection Mechanism

mcpmon includes built-in orphan detection and cleanup to handle crashed mcpmon instances:

**Automatic Detection:**
- Containers are considered orphaned when their associated mcpmon process (PID) no longer exists
- Orphans are detected by checking if the `mcpmon.pid` label references a dead process
- Containers without PID labels are also considered orphaned

### Cleanup Commands

**Manual Cleanup:**
```bash
# Scan for orphaned containers and prompt for cleanup
mcpmon --cleanup

# Force cleanup without confirmation
mcpmon --cleanup --force

# Verbose cleanup with detailed logging
mcpmon --cleanup --verbose --force
```

## Troubleshooting

### Common Issues

1. **Container won't stop**: Try `docker kill` instead of `docker stop`
2. **Permission errors**: Ensure Docker daemon is running and user has permissions
3. **Stale containers**: Use `mcpmon --cleanup --force` to remove orphaned containers
4. **Process still running**: Check if mcpmon process crashed with `ps aux | grep mcpmon`

### Diagnostic Commands

**Manual Container Inspection:**
```bash
# Check all mcpmon-managed containers
docker ps -a --filter label=mcpmon.managed=true

# Inspect specific container labels
docker inspect <container-id> --format='{{range $key, $value := .Config.Labels}}{{if eq $key "mcpmon.session"}}Session: {{$value}}{{end}}{{if eq $key "mcpmon.pid"}}PID: {{$value}}{{end}}{{if eq $key "mcpmon.started"}}Started: {{$value}}{{end}}{{end}}'

# Find containers for specific session
docker ps --filter label=mcpmon.session=<session-id>
```

**Finding Orphaned Containers:**
```bash
# List all mcpmon containers with process status
docker ps --filter label=mcpmon.managed=true --format "table {{.ID}}\t{{.Names}}\t{{.Label \"mcpmon.pid\"}}\t{{.Status}}"

# Check if mcpmon process is still running
ps aux | grep mcpmon | grep <pid>
```

### Manual Recovery

**Manual Cleanup Commands:**
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

## Environment Integration

mcpmon supports comprehensive environment variable configuration for Docker containers, including both mcpmon-specific variables and container environment variables.

**mcpmon Configuration Variables:**
```bash
# mcpmon behavior configuration
MCPMON_WATCH="src/,config/" mcpmon docker run -d my-server:latest
MCPMON_DELAY=2000 mcpmon docker run -d my-server:latest
MCPMON_VERBOSE=1 mcpmon docker run -d my-server:latest
MCPMON_EXTENSIONS_DIR=./docker-data mcpmon docker run -d my-server:latest
MAX_MCP_OUTPUT_TOKENS=10000 mcpmon docker run -d my-server:latest
```

**Container Environment Variables:**
```bash
# Pass environment variables to container
mcpmon docker run -d -e API_KEY=secret -e DEBUG=true my-server:latest

# Environment file support
mcpmon docker run -d --env-file .env my-server:latest

# Combined mcpmon and container configuration
MCPMON_VERBOSE=1 mcpmon docker run -d \
  -e NODE_ENV=development \
  -e API_KEY=secret \
  -e LOG_LEVEL=debug \
  my-server:latest
```

**Docker Compose Environment Integration:**
```bash
# Use environment variables in docker-compose.yml
MCPMON_WATCH="./src" mcpmon docker compose up my-service

# Override compose environment
mcpmon docker compose -f docker-compose.yml \
  -f docker-compose.override.yml \
  up my-service
```

## Safety and Migration

### Safety Improvements

**Session Isolation:**
- Each mcpmon instance only manages containers from its own session
- Prevents accidental termination of containers managed by other mcpmon instances
- Session ID is included in all container operations for verification

**Graceful Shutdown:**
- Containers are stopped gracefully with 10-second timeout before force kill
- mcpmon tracks container lifecycle and cleans up on exit
- Failed stop operations automatically fallback to force kill

### Migration Notes

- **Behavior Change**: mcpmon now uses session-based tracking instead of image-based management
- **Improved Safety**: No longer affects containers not started by the same mcpmon instance
- **Backward Compatibility**: Existing containers without mcpmon labels are ignored
- **Cleanup Required**: Run `mcpmon --cleanup` to remove containers from previous versions

## Usage Examples

```bash
# Basic Docker container with hot-reload
mcpmon docker run -d -p 3000:3000 my-mcp-server:latest

# Docker Compose services with environment configuration
MCPMON_WATCH="./src,./config" mcpmon docker compose up my-service

# Container with comprehensive environment setup
mcpmon docker run -d \
  -p 3000:3000 \
  -e API_KEY=secret \
  -e NODE_ENV=development \
  -e LOG_LEVEL=debug \
  --env-file .env \
  my-server:latest

# Development mode with volume mounting and environment
MCPMON_VERBOSE=1 mcpmon docker run -d \
  -p 3000:3000 \
  -v $(pwd)/src:/app/src \
  -e NODE_ENV=development \
  -e WATCH_FILES=true \
  my-server:latest

# Cleanup orphaned containers after crashes
mcpmon --cleanup --force

# Monitor cleanup process with verbose output
mcpmon --cleanup --verbose
```