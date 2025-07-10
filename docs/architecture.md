# Architecture Documentation

This document explains the internal architecture and design principles of mcpmon.

## Table of Contents

- [Overview](#overview)
- [Core Components](#core-components)
- [Message Flow](#message-flow)
- [Extensions](#extensions)
- [Deployment](#deployment)
- [Testing](#testing)
- [File Watching](#file-watching)
- [Process Management](#process-management)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

## Overview

mcpmon acts as a transparent proxy between MCP clients (like Claude Desktop) and MCP servers, enabling automatic server restarts when files change.

```
┌─────────────────┐    JSON-RPC    ┌──────────────────┐    JSON-RPC    ┌─────────────────┐
│                 │ ◄─────────────► │                  │ ◄─────────────► │                 │
│   MCP Client    │                │   mcpmon Proxy   │                │   MCP Server    │
│ (Claude Desktop)│                │                  │                │                 │
└─────────────────┘                └──────────────────┘                └─────────────────┘
                                             │
                                             │ File Events
                                             ▼
                                    ┌─────────────────┐
                                    │  File Watcher   │
                                    │                 │
                                    └─────────────────┘
```

## Core Components

### 1. Main Proxy (`src/proxy.ts`)

The main proxy implementation uses dependency injection for platform independence:

```typescript
// Dependency injection architecture
interface ProxyDependencies {
  procManager: ProcessManager;
  fs: FileSystem;
  stdin: ReadableStream<Uint8Array>;
  stdout: WritableStream<Uint8Array>;
  stderr: WritableStream<Uint8Array>;
  exit: (code: number) => void;
}

class MCPProxy {
  constructor(
    private deps: ProxyDependencies,
    private config: MCPProxyConfig,
  ) {}

  async start() {
    await this.startServer();
    await this.setupFileWatcher();
    this.setupMessageHandling();
  }
}
```

**Responsibilities:**

- Initialize and coordinate all subsystems
- Handle stdin/stdout communication with MCP client
- Manage the overall lifecycle

### 2. Platform Interfaces (`src/interfaces.ts`)

Abstract interfaces enable cross-platform compatibility:

```typescript
interface ProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
}

interface FileSystem {
  watch(paths: string[]): AsyncIterable<FileEvent>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  copyFile(src: string, dest: string): Promise<void>;
}

type FileEventType = "create" | "modify" | "remove";

interface FileEvent {
  type: FileEventType;
  path: string;
}
```

**Platform Implementations:**

- **Node.js**: `NodeProcessManager`, `NodeFileSystem`
- **Mock**: `MockProcessManager`, `MockFileSystem` (for testing)

### 3. Server Process Manager

Manages the lifecycle of the actual MCP server process:

```typescript
class McpServerProcess {
  private process: ChildProcess | null = null;
  private startupTimeout: number = 30000;
  private shutdownTimeout: number = 10000;

  async start(): Promise<void>;
  async stop(): Promise<void>;
  async restart(): Promise<void>;
}
```

**Key Features:**

- Graceful process startup with timeout
- Signal-based shutdown (SIGTERM → SIGKILL)
- Process health monitoring
- Automatic cleanup on errors

### 4. File Watcher

Monitors files for changes:

```typescript
class FileWatcher {
  private fs: FileSystem;
  private watchPaths: string[];

  async start() {
    for await (const event of this.fs.watch(this.watchPaths)) {
      this.handleFileEvent(event);
    }
  }
}
```

**Event Types:**

- `create`: New files created
- `modify`: Existing files modified
- `remove`: Files deleted

### 5. Message Buffer

Buffers incoming messages during server restarts to prevent loss:

```typescript
class MessageBuffer {
  private buffer: Array<JsonRpcMessage> = [];
  private isBuffering: boolean = false;

  buffer(message: JsonRpcMessage): void;
  flush(): JsonRpcMessage[];
  clear(): void;
}
```

**Buffering Strategy:**

- Buffer all messages during restart window
- Replay buffered messages after server restart
- Handle initialize requests specially
- Drop messages on buffer overflow

### 6. Debouncer

Prevents rapid successive restarts from file system noise:

```typescript
class Debouncer {
  private timeout: number | null = null;
  private delay: number = 2000;

  trigger(callback: () => void): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(callback, this.delay);
  }
}
```

## Message Flow

### Normal Operation

```
Client Request → Proxy → Server → Proxy → Client Response
```

1. **Client sends JSON-RPC message** (e.g., `tools/list`)
2. **Proxy forwards to server** via stdin
3. **Server processes and responds** via stdout
4. **Proxy forwards response to client** via stdout

### During Restart

```
Client Request → Buffer → [Server Restart] → Replay → Response
```

1. **File change detected** → Restart triggered
2. **Incoming messages buffered** during restart window
3. **Server stopped gracefully** (SIGTERM)
4. **New server started** with same configuration
5. **Buffered messages replayed** to new server
6. **Normal operation resumed**

### Initialization Sequence

```mermaid
sequenceDiagram
    participant C as Client
    participant P as Proxy
    participant S as Server
    
    C->>P: initialize
    P->>S: initialize
    S->>P: capabilities
    P->>C: capabilities
    
    Note over P: Server ready, file watching active
    
    C->>P: tools/list
    P->>S: tools/list  
    S->>P: tools response
    P->>C: tools response
```

## Extensions

The extension system provides a pluggable architecture for enhancing mcpmon functionality without modifying core code. Extensions can intercept messages, add custom tools, and integrate with the proxy lifecycle through a well-defined hook system.

### Extension Architecture Overview

Extensions follow a modular design with clean separation of concerns:

```typescript
// Extension interface
interface Extension {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly defaultEnabled: boolean;
  readonly configSchema?: any;
  
  initialize(context: ExtensionContext): Promise<void>;
  shutdown(): Promise<void>;
}
```

**Core Principles:**

- **Isolation**: Extensions run in isolated contexts with limited access to core systems
- **Composability**: Multiple extensions can be combined without conflicts
- **Configuration**: Each extension can define its own configuration schema
- **Lifecycle Management**: Extensions participate in proxy initialization and shutdown

### Hook System

Extensions integrate with mcpmon through lifecycle hooks at well-defined points:

```typescript
interface ExtensionHooks {
  // Message processing hooks
  beforeStdinForward?: MessageHook;
  afterStdoutReceive?: MessageHook;
  
  // Lifecycle hooks
  beforeRestart?: () => Promise<void>;
  afterServerStart?: () => Promise<void>;
  onShutdown?: () => Promise<void>;
  
  // Tool integration hooks
  getAdditionalTools?: () => Promise<ToolDefinition[]>;
  handleToolCall?: (toolName: string, args: any) => Promise<any | null>;
}
```

**Hook Types:**

1. **Message Hooks**: Intercept and transform JSON-RPC messages
   - `beforeStdinForward`: Modify requests before forwarding to server
   - `afterStdoutReceive`: Transform responses before returning to client

2. **Lifecycle Hooks**: React to proxy state changes
   - `beforeRestart`: Cleanup before server restart
   - `afterServerStart`: Initialize after server startup
   - `onShutdown`: Cleanup during proxy shutdown

3. **Tool Hooks**: Add custom MCP tools
   - `getAdditionalTools`: Register new tools dynamically
   - `handleToolCall`: Handle custom tool execution

### Hook Execution Flow

```
Client Request → beforeStdinForward → Server → afterStdoutReceive → Client Response
                      ↓                            ↓
                [Extension Chain]            [Extension Chain]
```

**Processing Order:**

- Hooks execute in extension registration order
- Each hook can modify the message or return null to block it
- Failed hooks are logged but don't stop message processing
- Extensions can chain transformations by returning modified messages

### Dependency Injection Container

The extension system uses a simple dependency injection pattern to provide services:

```typescript
interface ExtensionContext {
  // Core dependencies
  dependencies: ProxyDependencies;
  
  // Extension-specific services
  hooks: ExtensionHooks;
  logger: ExtensionLogger;
  notificationService?: NotificationService;
  
  // Configuration and data
  config: any;
  dataDir: string;
  sessionId: string;
}
```

**Service Injection:**

- **Dependencies**: Platform-specific implementations (ProcessManager, FileSystem)
- **Logger**: Scoped logger for extension output
- **Notification Service**: Send progress notifications to clients
- **Data Directory**: Isolated storage for extension data
- **Session ID**: Unique identifier for proxy instance

**Platform Abstraction:**

```typescript
// Extensions receive platform-agnostic interfaces
interface ProxyDependencies {
  procManager: ProcessManager;
  fs: FileSystem;
  stdin: ReadableStream<Uint8Array>;
  stdout: WritableStream<Uint8Array>;
  stderr: WritableStream<Uint8Array>;
  exit: (code: number) => void;
}
```

### Extension Registry and Management

The extension registry manages the lifecycle of all extensions:

```typescript
class ExtensionRegistry {
  // Registration
  register(extension: Extension): void;
  
  // State management
  getEnabled(): Extension[];
  setEnabled(extensionId: string, enabled: boolean): void;
  
  // Configuration
  getConfig(extensionId: string): any;
  setConfig(extensionId: string, config: any): void;
  
  // Lifecycle
  initializeAll(context: ExtensionContext): Promise<void>;
  shutdownAll(): Promise<void>;
  
  // Built-in extensions
  loadBuiltinExtensions(): Promise<void>;
}
```

**Registration Process:**

1. **Extension Discovery**: Built-in extensions loaded from `/extensions/` directory
2. **Configuration Merge**: Extension configs merged with user-provided settings
3. **Dependency Resolution**: Services injected into extension context
4. **Initialization**: Extensions initialized in registration order
5. **Hook Registration**: Extension hooks registered with proxy

**State Management:**

- Extensions can be enabled/disabled at runtime
- Configuration changes trigger extension reinitialization
- Failed extensions are automatically disabled
- Registry exports/imports configuration for persistence

### Extension Development Patterns

**Message Processing Extension:**

```typescript
class MessageProcessorExtension implements Extension {
  id = 'message-processor';
  name = 'Message Processor';
  version = '1.0.0';
  defaultEnabled = true;
  
  async initialize(context: ExtensionContext): Promise<void> {
    context.hooks.beforeStdinForward = async (message) => {
      // Add metadata to outgoing messages
      return {
        ...message,
        metadata: {
          ...message.metadata,
          processedBy: this.id,
          timestamp: Date.now()
        }
      };
    };
  }
  
  async shutdown(): Promise<void> {
    // Cleanup resources
  }
}
```

**Custom Tool Extension:**

```typescript
class CustomToolExtension implements Extension {
  id = 'custom-tool';
  name = 'Custom Tool';
  version = '1.0.0';
  defaultEnabled = false;
  
  async initialize(context: ExtensionContext): Promise<void> {
    context.hooks.getAdditionalTools = async () => [{
      name: 'my_tool',
      description: 'Custom tool implementation',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    }];
    
    context.hooks.handleToolCall = async (toolName, args) => {
      if (toolName === 'my_tool') {
        return {
          content: [{
            type: 'text',
            text: `Processed: ${args.input}`
          }]
        };
      }
      return null;
    };
  }
  
  async shutdown(): Promise<void> {}
}
```

### Built-in Extensions

**Available Extensions:**

- `large-response-handler`: Handles large server responses (>25KB)
- `request-logger`: Logs all JSON-RPC messages (planned)
- `metrics`: Collects performance metrics (planned)
- `auth`: Authentication and authorization (planned)
- `rate-limiter`: Request rate limiting (planned)

**Extension Loading:**

```typescript
// Built-in extensions auto-loaded from extensions directory
const builtins = [
  'large-response-handler',
  'request-logger',
  'metrics'
];

// External extensions loaded from node_modules
const external = [
  'mcpmon-extension-auth',
  'mcpmon-extension-cache'
];
```

The extension system provides a powerful, type-safe way to extend mcpmon functionality while maintaining clean separation between core proxy logic and optional features.

## Deployment

mcpmon supports multiple deployment strategies to meet different production requirements. The deployment architecture emphasizes containerization, extension management, and horizontal scaling capabilities.

### Docker Deployment Strategies

Docker provides the primary deployment mechanism for mcpmon in production environments, offering consistent execution across different platforms and simplified dependency management.

#### Container Architecture

```dockerfile
# Multi-stage build for optimized production image
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["mcpmon", "node", "server.js"]
```

**Container Design Principles:**

- **Minimal Base Images**: Use Alpine Linux for reduced attack surface and smaller image size
- **Multi-stage Builds**: Separate build and runtime environments for optimized production images
- **Non-root Execution**: Run containers with unprivileged user for enhanced security
- **Health Checks**: Include container health monitoring for orchestration platforms

#### Production Deployment Patterns

**1. Standalone Container Deployment**

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcpmon:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MCPMON_LOG_LEVEL=info
      - MCPMON_EXTENSIONS_ENABLED=large-response-handler,metrics
    volumes:
      - ./server:/app/server:ro
      - ./extensions:/app/extensions:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**2. Kubernetes Deployment**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcpmon-deployment
  labels:
    app: mcpmon
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcpmon
  template:
    metadata:
      labels:
        app: mcpmon
    spec:
      containers:
      - name: mcpmon
        image: mcpmon:latest
        ports:
        - containerPort: 3000
        env:
        - name: MCPMON_EXTENSIONS_ENABLED
          value: "large-response-handler,metrics,auth"
        - name: MCPMON_LOG_LEVEL
          value: "info"
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

**3. Serverless Container Deployment**

```yaml
# AWS Fargate deployment via ECS
family: mcpmon-task
networkMode: awsvpc
requiresCompatibilities:
  - FARGATE
cpu: 256
memory: 512
containerDefinitions:
  - name: mcpmon
    image: mcpmon:latest
    portMappings:
      - containerPort: 3000
        protocol: tcp
    environment:
      - name: MCPMON_CLOUD_PROVIDER
        value: "aws"
      - name: MCPMON_SCALING_MODE
        value: "serverless"
    logConfiguration:
      logDriver: awslogs
      options:
        awslogs-group: "/ecs/mcpmon"
        awslogs-region: "us-east-1"
        awslogs-stream-prefix: "ecs"
```

### Extension Management in Containers

Container deployments require careful management of extensions to maintain security, performance, and operational consistency across environments.

#### Extension Loading Strategies

**Built-in Extension Management:**

```typescript
// Container extension configuration
interface ContainerExtensionConfig {
  enabledExtensions: string[];
  extensionPaths: string[];
  extensionRegistry: string;
  autoUpdate: boolean;
  securityPolicy: ExtensionSecurityPolicy;
}

// Security policies for containerized extensions
interface ExtensionSecurityPolicy {
  allowedExtensions: string[];
  blockedExtensions: string[];
  requireSignedExtensions: boolean;
  sandboxMode: boolean;
  resourceLimits: ResourceLimits;
}
```

**Extension Distribution Methods:**

1. **Baked-in Extensions**: Extensions included in container image at build time
   ```dockerfile
   # Copy extensions during image build
   COPY extensions/ /app/extensions/
   RUN mcpmon extensions validate /app/extensions/
   ```

2. **Volume-mounted Extensions**: Extensions mounted from external volumes
   ```yaml
   volumes:
     - ./extensions:/app/extensions:ro
     - extension-config:/app/config/extensions
   ```

3. **Registry-based Extensions**: Extensions downloaded from package registries
   ```bash
   # Runtime extension installation
   mcpmon extensions install large-response-handler@latest
   mcpmon extensions install metrics@^2.0.0
   ```

#### Extension Configuration Management

**Environment-based Configuration:**

```bash
# Extension configuration via environment variables
MCPMON_EXTENSIONS_ENABLED="large-response-handler,metrics,auth"
MCPMON_EXTENSION_LARGE_RESPONSE_HANDLER_THRESHOLD="25600"
MCPMON_EXTENSION_METRICS_ENDPOINT="http://prometheus:9090"
MCPMON_EXTENSION_AUTH_PROVIDER="oauth2"
```

**ConfigMap-based Configuration (Kubernetes):**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcpmon-extensions-config
data:
  extensions.json: |
    {
      "enabled": [
        "large-response-handler",
        "metrics",
        "auth"
      ],
      "config": {
        "large-response-handler": {
          "threshold": 25600,
          "compressionEnabled": true
        },
        "metrics": {
          "endpoint": "http://prometheus:9090",
          "interval": 30000
        },
        "auth": {
          "provider": "oauth2",
          "clientId": "mcpmon-client"
        }
      }
    }
```

**Extension Health Monitoring:**

```typescript
// Container extension health checks
interface ExtensionHealthStatus {
  extensionId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: Date;
  errorCount: number;
  memoryUsage: number;
  responseTime: number;
}

// Health endpoint response
app.get('/health/extensions', (req, res) => {
  const extensionHealth = extensionRegistry.getHealthStatus();
  const overallHealth = extensionHealth.every(ext => ext.status === 'healthy');
  
  res.status(overallHealth ? 200 : 503).json({
    status: overallHealth ? 'healthy' : 'degraded',
    extensions: extensionHealth
  });
});
```

### Environment Configuration for Deployment

Production deployments require comprehensive environment configuration to ensure security, performance, and operational monitoring across different deployment targets.

#### Core Environment Variables

```bash
# Production environment configuration
MCPMON_LOG_LEVEL="info"                    # Logging level (debug|info|warn|error)
MCPMON_LOG_FORMAT="json"                   # Log format (json|text)
MCPMON_METRICS_ENABLED="true"              # Enable metrics collection
MCPMON_HEALTH_CHECK_PORT="8080"            # Health check endpoint port
MCPMON_SHUTDOWN_TIMEOUT="30000"            # Graceful shutdown timeout (ms)
MCPMON_MAX_MESSAGE_SIZE="10485760"         # Maximum message size (10MB)
MCPMON_RESTART_BACKOFF="exponential"       # Restart backoff strategy
MCPMON_FILE_WATCH_DEBOUNCE="2000"         # File change debounce timeout (ms)
```

#### Extension-specific Configuration

```bash
# Extension configuration
MCPMON_EXTENSIONS_ENABLED="large-response-handler,metrics,auth,rate-limiter"
MCPMON_EXTENSIONS_PATH="/app/extensions"   # Extension discovery path
MCPMON_EXTENSIONS_REGISTRY="registry.mcpmon.io"  # Extension registry URL
MCPMON_EXTENSIONS_AUTO_UPDATE="false"      # Disable auto-updates in production

# Large Response Handler extension
MCPMON_EXTENSION_LARGE_RESPONSE_HANDLER_THRESHOLD="25600"
MCPMON_EXTENSION_LARGE_RESPONSE_HANDLER_COMPRESSION="gzip"

# Metrics extension
MCPMON_EXTENSION_METRICS_PROMETHEUS_ENDPOINT="http://prometheus:9090"
MCPMON_EXTENSION_METRICS_COLLECTION_INTERVAL="30000"
MCPMON_EXTENSION_METRICS_LABELS="environment=production,service=mcpmon"

# Authentication extension
MCPMON_EXTENSION_AUTH_PROVIDER="oauth2"
MCPMON_EXTENSION_AUTH_CLIENT_ID="mcpmon-prod"
MCPMON_EXTENSION_AUTH_ISSUER_URL="https://auth.company.com"

# Rate Limiter extension
MCPMON_EXTENSION_RATE_LIMITER_REQUESTS_PER_MINUTE="1000"
MCPMON_EXTENSION_RATE_LIMITER_BURST_SIZE="100"
```

#### Security Configuration

```bash
# Security settings
MCPMON_SECURITY_SIGNED_EXTENSIONS_ONLY="true"  # Require signed extensions
MCPMON_SECURITY_SANDBOX_EXTENSIONS="true"      # Run extensions in sandbox
MCPMON_SECURITY_ALLOWED_HOSTS="*.company.com"  # Allowed host patterns
MCPMON_SECURITY_TLS_CERT_PATH="/certs/tls.crt" # TLS certificate path
MCPMON_SECURITY_TLS_KEY_PATH="/certs/tls.key"  # TLS private key path
MCPMON_SECURITY_CORS_ORIGINS="https://app.company.com,https://admin.company.com"
```

#### Cloud Provider Integration

```bash
# AWS-specific configuration
MCPMON_CLOUD_PROVIDER="aws"
MCPMON_AWS_REGION="us-east-1"
MCPMON_AWS_SECRETS_MANAGER_ENABLED="true"
MCPMON_AWS_CLOUDWATCH_LOGS_GROUP="/aws/ecs/mcpmon"
MCPMON_AWS_XRAY_TRACING_ENABLED="true"

# Azure-specific configuration
MCPMON_CLOUD_PROVIDER="azure"
MCPMON_AZURE_KEYVAULT_URL="https://mcpmon-kv.vault.azure.net/"
MCPMON_AZURE_APP_INSIGHTS_KEY="${APP_INSIGHTS_INSTRUMENTATION_KEY}"

# GCP-specific configuration
MCPMON_CLOUD_PROVIDER="gcp"
MCPMON_GCP_PROJECT_ID="mcpmon-production"
MCPMON_GCP_LOGGING_ENABLED="true"
MCPMON_GCP_TRACE_ENABLED="true"
```

### Scaling Considerations

Production mcpmon deployments must handle varying loads through horizontal scaling, load balancing, and resource optimization strategies.

#### Horizontal Scaling Architecture

**Load-balanced Proxy Cluster:**

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (HAProxy/Nginx)│
                    └─────────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼────┐ ┌────────▼────┐ ┌────────▼────┐
    │ mcpmon-01    │ │ mcpmon-02   │ │ mcpmon-03   │
    │ Extensions:  │ │ Extensions: │ │ Extensions: │
    │ - handler    │ │ - handler   │ │ - handler   │
    │ - metrics    │ │ - metrics   │ │ - metrics   │
    │ - auth       │ │ - auth      │ │ - auth      │
    └──────────────┘ └─────────────┘ └─────────────┘
              │               │               │
    ┌─────────▼────┐ ┌────────▼────┐ ┌────────▼────┐
    │ MCP Server A │ │ MCP Server B│ │ MCP Server C│
    └──────────────┘ └─────────────┘ └─────────────┘
```

**Scaling Strategies:**

1. **Session Affinity**: Route clients to consistent proxy instances
   ```nginx
   upstream mcpmon_backend {
       ip_hash;  # Session affinity based on client IP
       server mcpmon-01:3000 max_fails=3 fail_timeout=30s;
       server mcpmon-02:3000 max_fails=3 fail_timeout=30s;
       server mcpmon-03:3000 max_fails=3 fail_timeout=30s;
   }
   ```

2. **Stateless Proxy Design**: Enable any proxy to handle any request
   ```typescript
   // Shared state management for stateless scaling
   interface StatelessProxyConfig {
     sessionStore: 'redis' | 'memcached' | 'database';
     sessionTtl: number;
     loadBalancingAlgorithm: 'round-robin' | 'least-connections' | 'weighted';
     healthCheckInterval: number;
   }
   ```

3. **Auto-scaling Configuration**:
   ```yaml
   # Kubernetes Horizontal Pod Autoscaler
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: mcpmon-hpa
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: mcpmon-deployment
     minReplicas: 2
     maxReplicas: 10
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 70
     - type: Resource
       resource:
         name: memory
         target:
           type: Utilization
           averageUtilization: 80
     behavior:
       scaleDown:
         stabilizationWindowSeconds: 300
         policies:
         - type: Percent
           value: 10
           periodSeconds: 60
       scaleUp:
         stabilizationWindowSeconds: 60
         policies:
         - type: Percent
           value: 50
           periodSeconds: 60
   ```

#### Resource Optimization

**Memory Management:**

```typescript
// Production memory optimization settings
interface ProductionResourceConfig {
  maxHeapSize: string;              // "512m" - JVM-style heap limit
  maxOldSpaceSize: string;          // "400m" - Node.js old space limit
  maxSemiSpaceSize: string;         // "64m" - V8 semi space limit
  gcOptimization: boolean;          // Enable aggressive GC
  memoryLeakDetection: boolean;     // Enable memory leak monitoring
}

// Extension resource limits
interface ExtensionResourceLimits {
  maxMemoryPerExtension: number;    // 50MB per extension
  maxCpuPerExtension: number;       // 100m CPU per extension
  maxFileHandles: number;           // 1000 file handles
  maxNetworkConnections: number;    // 100 connections
}
```

**Performance Tuning:**

```bash
# Node.js performance tuning for production
NODE_OPTIONS="--max-old-space-size=512 --gc-interval=100"
UV_THREADPOOL_SIZE="16"           # Increase libuv thread pool
NODE_ENV="production"             # Enable production optimizations

# mcpmon-specific performance settings
MCPMON_MESSAGE_BUFFER_SIZE="1000"        # Message buffer limit
MCPMON_CONCURRENT_REQUESTS="100"         # Max concurrent requests
MCPMON_EXTENSION_TIMEOUT="5000"          # Extension timeout (ms)
MCPMON_RESTART_RATE_LIMIT="10"           # Max restarts per minute
```

#### Monitoring and Observability

**Production Monitoring Stack:**

```yaml
# Monitoring configuration
monitoring:
  prometheus:
    enabled: true
    port: 9090
    metrics:
      - mcpmon_requests_total
      - mcpmon_request_duration_seconds
      - mcpmon_extension_execution_time
      - mcpmon_server_restarts_total
      - mcpmon_memory_usage_bytes
  
  jaeger:
    enabled: true
    endpoint: "http://jaeger:14268"
    sampling_rate: 0.1
  
  logging:
    level: "info"
    format: "json"
    destinations:
      - "stdout"
      - "elasticsearch"
    
  alerting:
    rules:
      - name: "high_error_rate"
        condition: "error_rate > 5%"
        duration: "5m"
      - name: "high_memory_usage"
        condition: "memory_usage > 80%"
        duration: "10m"
      - name: "extension_failure"
        condition: "extension_errors > 0"
        duration: "1m"
```

**Health Check Endpoints:**

```typescript
// Comprehensive health checks for production
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.MCPMON_VERSION,
    extensions: extensionRegistry.getHealthStatus(),
    resources: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };
  
  const isHealthy = health.extensions.every(ext => ext.status === 'healthy');
  res.status(isHealthy ? 200 : 503).json(health);
});

app.get('/ready', (req, res) => {
  const ready = {
    status: proxy.isReady() ? 'ready' : 'not-ready',
    serverConnected: proxy.serverManager.isConnected(),
    extensionsLoaded: extensionRegistry.areAllExtensionsLoaded()
  };
  
  const isReady = ready.status === 'ready' && ready.serverConnected && ready.extensionsLoaded;
  res.status(isReady ? 200 : 503).json(ready);
});
```

The deployment architecture ensures mcpmon can scale efficiently across different environments while maintaining extension functionality, security, and operational visibility in production systems.

## Testing

mcpmon employs a comprehensive testing architecture built on **dependency injection (DI)** principles, enabling reliable, fast behavioral testing alongside integration tests. The testing framework supports both unit tests with mock implementations and integration tests with real components.

### Testing Architecture with Dependency Injection

The testing framework is built around a **three-tier architecture** that separates concerns and enables different types of testing:

```typescript
// Three-tier testing architecture
interface TestingArchitecture {
  // Tier 1: Unit Tests - Fast, isolated with mocks
  unit: {
    mockMCPMon: MockMCPMon;
    testContainer: TestContainer;
    mockServices: MockServices;
  };
  
  // Tier 2: Integration Tests - Real components
  integration: {
    testHarness: TestHarness;
    realProxy: MCPProxy;
    mockServer: MockMCPServer;
  };
  
  // Tier 3: End-to-End Tests - Full system
  e2e: {
    clientSimulator: MCPClientSimulator;
    realServer: MCPServer;
    systemTest: E2ETestContext;
  };
}
```

**Core DI Principles:**

1. **Interface-Based Design**: All components depend on interfaces, not concrete implementations
2. **Service Registration**: Services are registered with the TestContainer and resolved at runtime
3. **Mock Implementations**: Comprehensive mocks enable isolated testing without external dependencies
4. **Dependency Inversion**: High-level test modules don't depend on low-level implementation details

### TestContainer and Service Registration

The `TestContainer` class provides centralized dependency injection management for all test components:

```typescript
// TestContainer singleton with service registration
class TestContainer {
  private static container: Container;
  
  // Register extension test suite with decorator
  @TestContainer.register('large-response-handler')
  class LargeResponseHandlerTests implements ExtensionTestSuite {
    // Test implementation
  }
  
  // Service registration
  static bindServices(): void {
    container.bind(TEST_TYPES.TestHarness).to(TestHarnessImpl);
    container.bind(TEST_TYPES.MockMCPMon).to(MockMCPMonImpl);
    container.bind(TEST_TYPES.TestLogger).to(TestLoggerImpl);
  }
}
```

**Service Registration Process:**

1. **Decorator Registration**: `@TestContainer.register()` decorator automatically registers test suites
2. **Interface Binding**: Services are bound to interface symbols, not concrete classes
3. **Named Bindings**: Extension test suites are registered with unique extension IDs
4. **Module Loading**: `ContainerModule` allows modular test configuration

**Service Resolution:**

```typescript
// Resolve services from container
const testSuite = testContainer.getTestSuite('large-response-handler');
const mockMCPMon = testContainer.get<MockMCPMon>(TEST_TYPES.MockMCPMon);
const testHarness = testContainer.get<TestHarness>(TEST_TYPES.TestHarness);
```

### Mock Implementations and Test Doubles

The testing framework provides comprehensive mock implementations that simulate real mcpmon behavior:

#### MockMCPMon

Primary mock for unit testing extensions with controllable behavior:

```typescript
interface MockMCPMon {
  // Create controlled extension context
  createContext(options?: MockContextOptions): MockExtensionContext;
  
  // Simulate MCP protocol messages
  simulateRequest(request: MCPRequest): Promise<MCPResponse>;
  simulateResponse(response: MCPResponse): Promise<MCPResponse>;
  simulateNotification(notification: MCPNotification): Promise<void>;
  
  // Verification methods
  expectHookRegistered(hookName: keyof ExtensionHooks): void;
  expectToolRegistered(toolName: string): void;
  getCapturedMessages(): CapturedMessage[];
  getProgressNotifications(): ProgressNotification[];
}
```

**Mock Capabilities:**

- **Hook Simulation**: Process messages through registered extension hooks
- **Tool Verification**: Verify custom tools are properly registered
- **Message Capture**: Record all MCP protocol interactions for assertions
- **Progress Tracking**: Monitor progress notifications with token/progress pairs
- **Error Injection**: Simulate failure scenarios for robust testing

#### TestHarness

Integration testing harness that uses real mcpmon components:

```typescript
interface TestHarness {
  // Real proxy integration
  initialize(extensions: Extension[]): Promise<void>;
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  callTool(toolName: string, args: any, progressToken?: string): Promise<any>;
  
  // Extension lifecycle management
  enableExtension(extensionId: string): Promise<void>;
  disableExtension(extensionId: string): Promise<void>;
  withExtension<T>(extensionId: string, test: () => Promise<T>): Promise<T>;
  
  // Verification helpers
  expectNotification(method: string, timeout?: number): Promise<MCPNotification>;
  verifyExtensionState(extensionId: string, state: 'initialized' | 'shutdown'): void;
}
```

#### Mock Services

Platform-specific mock implementations for cross-platform testing:

```typescript
// Mock dependencies injected into test context
interface MockDependencies {
  procManager: MockProcessManager;     // Process spawning simulation
  changeSource: MockChangeSource;      // File watching simulation
  stdin: MockReadableStream;           // Standard input simulation
  stdout: MockWritableStream;          // Standard output capture
  stderr: MockWritableStream;          // Standard error capture
}
```

### Three-Tier Testing Approach Integration

The DI framework enables seamless integration across all three testing tiers:

#### Tier 1: Unit Tests (Fast, Isolated)

```typescript
describe('Extension Unit Tests', () => {
  let mockMCPMon: MockMCPMon;
  let context: MockExtensionContext;
  
  beforeEach(() => {
    mockMCPMon = testContainer.get<MockMCPMon>(TEST_TYPES.MockMCPMon);
    context = mockMCPMon.createContext({
      config: { threshold: 25600 }
    });
  });
  
  it('should register hook correctly', async () => {
    await extension.initialize(context);
    mockMCPMon.expectHookRegistered('afterStdoutReceive');
  });
});
```

**Unit Test Characteristics:**
- **Fast Execution**: All dependencies are mocked, no I/O operations
- **Deterministic**: Predictable behavior through controlled mocks
- **Isolated**: No external dependencies or side effects
- **Comprehensive**: Tests extension logic without platform concerns

#### Tier 2: Integration Tests (Real Components)

```typescript
describe('Extension Integration Tests', () => {
  let testHarness: TestHarness;
  
  beforeEach(async () => {
    testHarness = testContainer.get<TestHarness>(TEST_TYPES.TestHarness);
    await testHarness.initialize([largeResponseExtension]);
  });
  
  it('should handle large responses through real proxy', async () => {
    const response = await testHarness.sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'large_tool', arguments: {} }
    });
    
    expect(response.result).toBeDefined();
  });
});
```

**Integration Test Characteristics:**
- **Real Components**: Uses actual MCPProxy, extension system, and message processing
- **Mock Server**: Controlled server responses for predictable testing
- **System Integration**: Verifies component interactions work correctly
- **Performance Validation**: Tests real-world timing and resource usage

#### Tier 3: End-to-End Tests (Full System)

```typescript
describe('Extension E2E Tests', () => {
  let e2eContext: E2ETestContext;
  let clientSimulator: MCPClientSimulator;
  
  beforeEach(async () => {
    e2eContext = testContainer.get<E2ETestContext>(TEST_TYPES.E2EContext);
    clientSimulator = e2eContext.simulateClient('claude-desktop');
    await clientSimulator.connect();
  });
  
  it('should handle complete tool interaction flow', async () => {
    const result = await clientSimulator.callTool('large_tool', {}, 'progress-123');
    const notifications = clientSimulator.getNotifications();
    
    expect(notifications.some(n => n.method === 'notifications/progress')).toBe(true);
    expect(result).toBeDefined();
  });
});
```

**E2E Test Characteristics:**
- **Complete System**: Tests entire mcpmon → extension → server → client flow
- **Real Protocol**: Uses actual JSON-RPC message format and timing
- **Client Simulation**: Mimics real MCP client behavior (Claude Desktop, etc.)
- **End-User Validation**: Ensures features work as users expect

### Test Discovery and Execution

The DI framework includes automatic test discovery and execution:

```typescript
// Test discovery through container registration
const discoveredTests = TestContainer.getAllSuites();
const extensionTests = discoveredTests.filter(suite => 
  suite.metadata.tags?.includes('extension')
);

// Selective test execution
const soakTests = discoveredTests.filter(suite => 
  suite.metadata.tags?.includes('soak')
);
```

**Discovery Features:**
- **Automatic Registration**: Extensions register test suites via decorators
- **Metadata-Based Filtering**: Run tests by tags, extension ID, or other criteria
- **Parallel Execution**: Run independent test suites concurrently
- **Soak Testing**: Long-running tests validate system endurance

The DI-based testing architecture provides mcpmon with comprehensive, maintainable, and scalable testing capabilities that ensure reliability across all components while supporting rapid development cycles.

## File Watching

### Watch Strategies

1. **Single File Watching**
   ```bash
   MCPMON_WATCH=server.js
   ```
   - Watches specific file for changes
   - Most efficient for simple servers

2. **Directory Watching**
   ```bash
   MCPMON_WATCH=src/
   ```
   - Recursively watches directory
   - Captures all file changes in tree

3. **Multiple File/Directory Watching**
   ```bash
   MCPMON_WATCH=src/,config/,package.json
   ```
   - Watches multiple files and directories
   - Comma-separated list

### Change Event Filtering

Not all change events trigger restarts:

**Triggers Restart:**

- `.js`, `.ts`, `.py` file modifications
- Configuration file changes
- Package manifest changes (`package.json`, `tsconfig.json`)


**Ignored Events:**

- Temporary files (`.tmp`, `.swp`)
- Hidden files (`.DS_Store`, `.git/`)
- Log files (`.log`)
- Build artifacts (`node_modules/`, `dist/`)

### Debouncing Logic

File system events can be noisy. The debouncer prevents unnecessary restarts:

```typescript
// Example: Multiple rapid saves become single restart
save server.js    → debounce timer starts (2s)
save server.js    → timer resets (2s)  
save config.json  → timer resets (2s)
[2 seconds pass]  → restart triggered
```

## Process Management

### Startup Sequence

1. **Spawn Process**
   ```typescript
   const process = spawn(command, args, {
     stdio: ['pipe', 'pipe', 'inherit'],
     env: environment
   });
   ```

2. **Wait for Ready Signal**
   - Server must respond to `initialize` request
   - Timeout after 30 seconds (configurable)
   - Monitor stderr for error messages

3. **Setup Communication**
   - Pipe client stdin → server stdin
   - Pipe server stdout → client stdout
   - Monitor server stderr for logging

### Shutdown Sequence

1. **Graceful Shutdown** (SIGTERM)
   - Send SIGTERM to server process
   - Wait up to 10 seconds for clean exit
   - Close stdin/stdout pipes

2. **Forced Shutdown** (SIGKILL)
   - If graceful shutdown fails
   - Send SIGKILL to force termination
   - Clean up resources

3. **Cleanup**
   - Close all file descriptors
   - Clear message buffers
   - Reset internal state

### Error Recovery

**Server Crash Detection:**

```typescript
process.status.then((status) => {
  if (!this.isShuttingDown) {
    console.error(`Server crashed with code ${status.code}`);
    this.restart();
  }
});
```

**Automatic Restart on Crash:**

- Detect unexpected process exit
- Log crash reason and exit code
- Automatically restart with exponential backoff
- Maintain client connection during restart

## Error Handling

### Error Categories

1. **Configuration Errors**
   - Invalid command/arguments
   - Missing watch files
   - Invalid environment variables

2. **Runtime Errors**
   - Server startup failures
   - File watching errors
   - JSON-RPC parsing errors

3. **Process Errors**
   - Server crashes
   - Timeout errors
   - Resource exhaustion

### Error Recovery Strategies

**Startup Failures:**

```typescript
async startWithRetry(maxAttempts: number = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await this.start()
      return
    } catch (error) {
      if (attempt === maxAttempts) throw error
      await this.delay(1000 * attempt) // exponential backoff
    }
  }
}
```

**File Watching Failures:**

- Attempt to re-establish file watching
- Fall back to polling if native watching fails
- Continue operation without hot-reload if necessary

**Message Handling Errors:**

- Log malformed JSON-RPC messages
- Continue processing other messages
- Send error responses for invalid requests

## Performance Considerations

### Extension Performance Impact

The extension system is designed for minimal performance overhead while providing powerful extensibility. Extensions can impact performance through hook execution, memory usage, and message processing latency.

**Performance Impact Analysis:**

- **Hook Execution**: Each enabled extension adds ~0.1-2ms per message depending on hook complexity
- **Message Processing**: Extensions process messages synchronously in registration order
- **Memory Overhead**: Typical extension adds 1-5MB to base proxy memory footprint
- **Initialization Time**: Extension loading adds 50-200ms to proxy startup time

**Extension Chain Performance:**

```typescript
// Message flows through extension chain
Client Request → Extension1.beforeStdinForward → Extension2.beforeStdinForward → Server
Server Response → Extension2.afterStdoutReceive → Extension1.afterStdoutReceive → Client

// Total latency = sum of all hook execution times
totalLatency = hookExecution1 + hookExecution2 + ... + networkLatency
```

**Performance Monitoring:**

Extensions can be profiled using built-in performance tracking:

```typescript
// Extension performance tracking
interface ExtensionPerformanceMetrics {
  hookExecutionTimes: Map<string, number[]>;
  memoryUsage: MemoryUsageStats;
  messageProcessingLatency: number;
  totalMessagesProcessed: number;
}
```

### Hook Optimization Strategies

Extension hooks should be optimized for minimal performance impact on the proxy's message processing pipeline.

**Fast Hook Patterns:**

```typescript
// ✅ Good: Fast, minimal processing
context.hooks.beforeStdinForward = async (message) => {
  // Simple metadata addition
  return {
    ...message,
    metadata: { ...message.metadata, timestamp: Date.now() }
  };
};

// ✅ Good: Early return for irrelevant messages
context.hooks.afterStdoutReceive = async (message) => {
  if (message.method !== 'tools/call') return message;
  return processToolResponse(message);
};
```

**Slow Hook Anti-patterns:**

```typescript
// ❌ Bad: Synchronous blocking operations
context.hooks.beforeStdinForward = async (message) => {
  // Blocks entire message pipeline
  const data = fs.readFileSync('/large/file.json');
  return processWithData(message, data);
};

// ❌ Bad: Heavy computation in hook
context.hooks.afterStdoutReceive = async (message) => {
  // CPU-intensive processing blocks other messages
  return performExpensiveTransformation(message);
};
```

**Optimization Techniques:**

1. **Caching**: Cache expensive computations and file reads
2. **Lazy Loading**: Initialize heavy resources only when needed
3. **Async Optimization**: Use non-blocking operations where possible
4. **Message Filtering**: Process only relevant messages early in hooks
5. **Batching**: Group operations to reduce per-message overhead

**Hook Performance Guidelines:**

- Keep hook execution under 5ms for latency-sensitive applications
- Use async/await properly to avoid blocking the event loop
- Implement circuit breakers for external dependencies
- Cache frequently accessed data structures
- Profile hook performance during development

### Memory Usage Considerations

Extensions should manage memory efficiently to prevent resource leaks and proxy instability.

**Extension Memory Profile:**

```typescript
// Typical extension memory breakdown
interface ExtensionMemoryUsage {
  codeSize: number;          // 0.5-2MB (extension code)
  dataStructures: number;    // 1-10MB (caches, buffers)
  dependencies: number;      // 2-20MB (imported modules)
  runtime: number;          // 0.1-1MB (execution context)
}
```

**Memory Management Best Practices:**

1. **Resource Cleanup**: Properly dispose of resources in `shutdown()` method
2. **Bounded Caches**: Implement LRU or TTL-based cache eviction
3. **Stream Processing**: Process large responses in chunks, not in memory
4. **Weak References**: Use WeakMap/WeakSet for temporary associations
5. **Memory Monitoring**: Track memory usage trends over time

**Cache Management Example:**

```typescript
class OptimizedExtension implements Extension {
  private cache = new Map<string, any>();
  private readonly maxCacheSize = 1000;
  
  async initialize(context: ExtensionContext): Promise<void> {
    context.hooks.beforeStdinForward = async (message) => {
      // Bounded cache implementation
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      
      const cacheKey = `${message.method}-${JSON.stringify(message.params)}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }
      
      const processed = await this.processMessage(message);
      this.cache.set(cacheKey, processed);
      return processed;
    };
  }
  
  async shutdown(): Promise<void> {
    // Clean up all resources
    this.cache.clear();
  }
}
```

**Memory Leak Prevention:**

- Clear intervals and timeouts in shutdown hooks
- Remove event listeners before extension unload
- Close file handles and network connections
- Dispose of large object references

### Performance Monitoring Approaches

mcpmon provides comprehensive performance monitoring for extensions to identify bottlenecks and optimize system performance.

**Built-in Performance Metrics:**

```typescript
// Extension performance monitoring interface
interface ExtensionPerformanceMonitor {
  // Hook execution timing
  recordHookExecution(hookName: string, duration: number): void;
  getHookMetrics(hookName: string): HookMetrics;
  
  // Memory tracking
  recordMemoryUsage(extensionId: string, usage: MemoryUsage): void;
  getMemoryTrends(extensionId: string): MemoryTrend[];
  
  // Message processing metrics
  recordMessageLatency(messageId: string, latency: number): void;
  getLatencyPercentiles(): LatencyPercentiles;
}
```

**Performance Monitoring Dashboard:**

Extensions can expose performance metrics through a built-in monitoring interface:

```typescript
// Performance monitoring in extension context
class MonitoredExtension implements Extension {
  async initialize(context: ExtensionContext): Promise<void> {
    const monitor = context.performanceMonitor;
    
    context.hooks.beforeStdinForward = async (message) => {
      const start = performance.now();
      
      try {
        const result = await this.processMessage(message);
        return result;
      } finally {
        const duration = performance.now() - start;
        monitor.recordHookExecution('beforeStdinForward', duration);
      }
    };
  }
}
```

**Performance Alerting:**

Configure performance thresholds and alerting:

```typescript
// Performance threshold configuration
interface PerformanceThresholds {
  maxHookLatency: number;        // 5ms default
  maxMemoryUsage: number;        // 50MB default  
  maxMessageLatency: number;     // 100ms default
  errorRateThreshold: number;    // 5% default
}

// Automatic performance alerts
const perfConfig = {
  alertOnSlowHook: true,
  alertOnMemoryLeak: true, 
  alertOnHighLatency: true,
  performanceLogLevel: 'warn'
};
```

**Profiling and Debugging:**

Development tools for extension performance analysis:

```bash
# Enable performance profiling
MCPMON_PROFILE=true mcpmon node server.js

# Generate performance report
MCPMON_PERF_REPORT=true mcpmon node server.js

# Memory usage tracking
MCPMON_MEMORY_PROFILE=true mcpmon node server.js
```

**Performance Best Practices Summary:**

1. **Measure First**: Profile before optimizing to identify actual bottlenecks
2. **Optimize Gradually**: Make incremental improvements and measure impact
3. **Monitor Continuously**: Track performance metrics in production environments
4. **Set Budgets**: Define performance budgets for hook execution and memory usage
5. **Test Under Load**: Validate performance with realistic message volumes

### Core System Performance

**Memory Management:**

- **Message Buffer Limits**: Prevent unbounded growth during long restarts
- **Process Cleanup**: Ensure zombie processes are reaped
- **File Handle Limits**: Close watchers properly to avoid resource leaks

**Startup Optimization:**

```typescript
// Parallel initialization
await Promise.all([
  this.serverProcess.start(),
  this.fileWatcher.start(),
  this.setupSignalHandlers(),
]);
```

**Restart Performance:**

**Fast Restart Optimizations:**

- Keep environment variables cached
- Pre-validate server command before restart
- Use efficient process spawning APIs
- Minimize message buffer operations

**Typical Performance Metrics:**

- Cold startup: 1-3 seconds  
- Hot restart: 0.5-1.5 seconds
- File change detection: <100ms
- Message throughput: 1000+ messages/second

**Resource Usage:**

**Memory Footprint:**

- Base proxy: ~10MB
- Per-server overhead: ~5MB  
- Message buffers: ~1MB (typical)
- Extension overhead: 1-5MB per extension

**CPU Usage:**

- Idle: <1% CPU
- During restart: 5-10% CPU (brief spike)
- File watching: <1% CPU
- Extension processing: 1-3% CPU (under load)

## Security Considerations

### Process Isolation

- Server runs as separate process
- No shared memory between proxy and server
- Server inherits limited environment

### Input Validation

```typescript
function validateJsonRpc(message: unknown): JsonRpcMessage {
  // Validate required fields
  // Sanitize inputs
  // Reject malformed requests
}
```

### File System Access

- Restrict file watching to specified paths
- Validate watch paths exist and are accessible
- Prevent path traversal attacks

### Environment Variable Handling

- Sanitize environment variables
- Prevent injection through MCP_SERVER_ARGS
- Validate command paths

This architecture provides a robust, performant, and secure foundation for hot-reload MCP servers during development.
