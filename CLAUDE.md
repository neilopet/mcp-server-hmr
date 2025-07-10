# mcpmon - Hot-reload monitor for MCP servers

## Project Overview

mcpmon is a transparent proxy that sits between MCP clients (like Claude Desktop) and MCP servers, providing automatic hot-reload capabilities. It's designed to be like "nodemon but for MCP" - offering a simple, zero-configuration interface for development.

## Project Structure

```
claude-live-reload/
├── .env.example                                                           # ada87253 on 2025-07-01
├── .gitignore                                                             # 367941f9 on 2025-07-08
├── .nvmrc                                                                 # f09e5e9a on 2025-07-02
├── .prettierrc                                                            # a45dcff3 on 2025-07-01
├── CHANGELOG.md                                                           # 153adcf2 on 2025-07-02
├── CLAUDE.md                                                              # ce6cd760 on 2025-07-09
├── CONTRIBUTING.md                                                        # 153adcf2 on 2025-07-02
├── LICENSE                                                                # ada87253 on 2025-07-01
├── README.md                                                              # 9440ca4b on 2025-07-09
├── ROADMAP.md                                                             # 765677e4 on 2025-07-02
├── TROUBLESHOOTING.md                                                     # 3ee50da9 on 2025-07-02
├── coverage-report.md                                                     # 477e945d on 2025-07-02
├── issuetracker.txt                                                       # ff43311d on 2025-07-03
├── jest.config.js (0 dependencies)                                        # d9bed2c6 on 2025-07-09
├── jest.config.js.backup                                                  # cac2224c on 2025-07-03
├── jest.config.simple.js (0 dependencies)                                 # bb16c395 on 2025-07-03
├── jest.setup.ts (0 dependencies)                                         # ff43311d on 2025-07-03
├── lint-output.txt                                                        # a9c46ee8 on 2025-07-02
├── mcpServers.example.json                                                # ada87253 on 2025-07-01
├── package-lock.json                                                      # f611ccdc on 2025-07-07
├── package.json                                                           # f611ccdc on 2025-07-07
├── run-inspector.sh                                                       # ada87253 on 2025-07-01
├── test-docker-cleanup.sh                                                 # 2811826c on 2025-07-07
├── tsconfig.json                                                          # eb45049a on 2025-07-03
├── verify-docker-implementation.sh                                        # 2811826c on 2025-07-07
├── watch                                                                  # 4be29161 on 2025-06-30
├── .claude/                                                               # f84af523 on 2025-07-07
│   ├── mcp.json
│   ├── mcp.json.example                                                   # f84af523 on 2025-07-07
│   └── commands/
├── .github/                                                               # 04404bc5 on 2025-07-02
│   └── workflows/                                                         # 04404bc5 on 2025-07-02
│       ├── publish.yml                                                    # f09e5e9a on 2025-07-02
│       └── test.yml                                                       # 04404bc5 on 2025-07-02
├── cov_profile/
├── data/                                                                  # 5eec5e1c on 2025-07-07
│   └── lrh/                                                               # 5eec5e1c on 2025-07-07
│       └── datasets/                                                      # 5eec5e1c on 2025-07-07
│           └── 2025/                                                      # 5eec5e1c on 2025-07-07
│               └── 07/                                                    # 5eec5e1c on 2025-07-07
├── docs/                                                                  # ce6cd760 on 2025-07-09
│   ├── api.md                                                             # ce6cd760 on 2025-07-09
│   ├── architecture.md                                                    # 1fe708e8 on 2025-07-02
│   ├── extension-development.md
│   └── testing.md                                                         # ce6cd760 on 2025-07-09
├── example-extension/                                                     # eb45049a on 2025-07-03
│   ├── .gitignore                                                         # eb45049a on 2025-07-03
│   ├── CONTRIBUTING.md                                                    # eb45049a on 2025-07-03
│   ├── README.md                                                          # eb45049a on 2025-07-03
│   ├── deno.json                                                          # eb45049a on 2025-07-03
│   ├── package.json                                                       # eb45049a on 2025-07-03
│   ├── src/                                                               # eb45049a on 2025-07-03
│   │   ├── config.ts (0 dependencies)                                     # eb45049a on 2025-07-03
│   │   ├── index.ts (2 dependencies)                                      # eb45049a on 2025-07-03
│   │   │       ├→ ./logger.ts
│   │   │       └→ ./config.ts
│   │   └── logger.ts (1 dependency)                                       # eb45049a on 2025-07-03
│   │           └→ ./config.ts
│   └── tests/                                                             # eb45049a on 2025-07-03
│       ├── e2e.test.ts (1 dependency)                                     # eb45049a on 2025-07-03
│       │       └→ ./providers.ts
│       ├── index.ts (2 dependencies)                                      # eb45049a on 2025-07-03
│       │       ├→ ../src/index.ts
│       │       └→ ./providers.ts
│       ├── integration.test.ts (1 dependency)                             # eb45049a on 2025-07-03
│       │       └→ ./providers.ts
│       ├── providers.ts (2 dependencies)                                  # eb45049a on 2025-07-03
│       │       ├→ ../src/index.ts
│       │       └→ ../src/config.ts
│       └── unit.test.ts (4 dependencies)                                  # eb45049a on 2025-07-03
│               ├→ ../src/index.ts
│               ├→ ../src/logger.ts
│               ├→ ../src/config.ts
│               └→ ./providers.ts
├── examples/                                                              # 4ed6faad on 2025-07-01
│   ├── quickstart.md                                                      # 4ed6faad on 2025-07-01
│   ├── basic/                                                             # 4ed6faad on 2025-07-01
│   │   ├── README.md                                                      # 4ed6faad on 2025-07-01
│   │   └── server.js (0 dependencies)                                     # ada87253 on 2025-07-01
│   └── python/                                                            # 4ed6faad on 2025-07-01
│       ├── README.md                                                      # 4ed6faad on 2025-07-01
│       ├── requirements.txt                                               # ada87253 on 2025-07-01
│       └── server.py (0 dependencies)                                     # ada87253 on 2025-07-01
├── integration-test/                                                      # 1c081333 on 2025-07-01
│   ├── .mcp.json                                                          # 7183a361 on 2025-07-01
│   ├── final_test.cjs                                                     # 4ed6faad on 2025-07-01
│   ├── mcp_client.cjs                                                     # 7183a361 on 2025-07-01
│   ├── mcp_server_v2.cjs                                                  # 7183a361 on 2025-07-01
│   ├── test_hotreload.cjs                                                 # 1c081333 on 2025-07-01
│   ├── test_server.cjs                                                    # 7183a361 on 2025-07-01
│   └── scripts/
├── large-response-handler.work-in-progress/                               # eb45049a on 2025-07-03
│   ├── CLAUDE.md                                                          # eb45049a on 2025-07-03
│   ├── README.md                                                          # eb45049a on 2025-07-03
│   ├── handler.ts (0 dependencies)                                        # eb45049a on 2025-07-03
│   ├── index.ts (0 dependencies)                                          # eb45049a on 2025-07-03
│   └── tools.ts (0 dependencies)                                          # eb45049a on 2025-07-03
├── scripts/                                                               # 1c081333 on 2025-07-01
│   └── postinstall.js (0 dependencies)                                    # 1c081333 on 2025-07-01
├── src/                                                                   # d91c6841 on 2025-07-09
│   ├── CLAUDE.md                                                          # ce76bbff on 2025-07-01
│   ├── cli-utils.ts (0 dependencies)                                      # 12c240e1 on 2025-07-03
│   ├── cli.ts (0 dependencies)                                            # d91c6841 on 2025-07-09
│   ├── index.ts (0 dependencies)                                          # d9bed2c6 on 2025-07-09
│   ├── interfaces.ts (0 dependencies)                                     # eb45049a on 2025-07-03
│   ├── mcpmon-logger.ts (0 dependencies)                                  # d0782b7a on 2025-07-09
│   ├── proxy.ts (0 dependencies)                                          # d91c6841 on 2025-07-09
│   ├── setup.ts (0 dependencies)                                          # 83a3e80c on 2025-07-07
│   ├── stderr-parser.ts (0 dependencies)                                  # d9bed2c6 on 2025-07-09
│   ├── extensions/                                                        # 59e5493e on 2025-07-09
│   │   ├── CLAUDE.md                                                      # 23de3352 on 2025-07-06
│   │   ├── index.ts (0 dependencies)                                      # eb45049a on 2025-07-03
│   │   ├── interfaces.ts (0 dependencies)                                 # dc7c182a on 2025-07-04
│   │   ├── registry.ts (0 dependencies)                                   # 59e5493e on 2025-07-09
│   │   ├── registry.ts.backup                                             # 59e5493e on 2025-07-09
│   │   ├── large-response-handler/                                        # 64e1fcd2 on 2025-07-08
│   │   │   ├── index.test.ts (0 dependencies)                             # 4babfce6 on 2025-07-03
│   │   │   ├── index.ts (0 dependencies)                                  # 64e1fcd2 on 2025-07-08
│   │   │   ├── streaming.ts (0 dependencies)                              # dc7c182a on 2025-07-04
│   │   │   └── tests/                                                     # 5eec5e1c on 2025-07-07
│   │   │       ├── README.md                                              # 5eec5e1c on 2025-07-07
│   │   │       ├── index.ts (0 dependencies)                              # 5eec5e1c on 2025-07-07
│   │   │       ├── integration.test.ts (0 dependencies)                   # 6f667987 on 2025-07-06
│   │   │       ├── jest.config.js (0 dependencies)                        # b21ad04d on 2025-07-02
│   │   │       ├── providers.ts (0 dependencies)                          # eb45049a on 2025-07-03
│   │   │       ├── register.ts (0 dependencies)                           # b21ad04d on 2025-07-02
│   │   │       ├── setup.js (0 dependencies)                              # b21ad04d on 2025-07-02
│   │   │       ├── streaming.test.ts (0 dependencies)                     # 43662133 on 2025-07-07
│   │   │       ├── teardown.js (0 dependencies)                           # b21ad04d on 2025-07-02
│   │   │       └── unit.test.ts (0 dependencies)                          # 5eec5e1c on 2025-07-07
│   │   ├── metrics/                                                       # eb45049a on 2025-07-03
│   │   │   └── index.ts (0 dependencies)                                  # eb45049a on 2025-07-03
│   │   ├── request-logger/                                                # eb45049a on 2025-07-03
│   │   │   └── index.ts (0 dependencies)                                  # eb45049a on 2025-07-03
│   │   └── services/                                                      # dc7c182a on 2025-07-04
│   │       └── StdoutNotificationService.ts (0 dependencies)              # dc7c182a on 2025-07-04
│   ├── node/                                                              # f0196589 on 2025-07-02
│   │   ├── CLAUDE.md                                                      # ce76bbff on 2025-07-01
│   │   ├── NodeFileSystem.ts (0 dependencies)                             # a9c46ee8 on 2025-07-02
│   │   ├── NodeProcessManager.ts (0 dependencies)                         # f0196589 on 2025-07-02
│   │   └── index.ts (0 dependencies)                                      # 5c423762 on 2025-07-01
│   └── testing/                                                           # a46b73ef on 2025-07-06
│       ├── MCPMonTestHarness.ts (0 dependencies)                          # 631938b2 on 2025-07-06
│       ├── MockMCPMon.ts (0 dependencies)                                 # 631938b2 on 2025-07-06
│       ├── MockMCPServer.ts (0 dependencies)                              # 631938b2 on 2025-07-06
│       ├── README.md                                                      # a46b73ef on 2025-07-06
│       ├── TestContainer.ts (0 dependencies)                              # ff43311d on 2025-07-03
│       ├── discovery.ts (0 dependencies)                                  # eb45049a on 2025-07-03
│       ├── index.ts (0 dependencies)                                      # eb45049a on 2025-07-03
│       ├── types.ts (0 dependencies)                                      # 631938b2 on 2025-07-06
│       ├── e2e/                                                           # 02bd795d on 2025-07-04
│       │   ├── MCPClientSimulator.test.ts (0 dependencies)                # 02bd795d on 2025-07-04
│       │   ├── MCPClientSimulator.ts (0 dependencies)                     # 02bd795d on 2025-07-04
│       │   ├── README.md                                                  # eb45049a on 2025-07-03
│       │   └── index.ts (0 dependencies)                                  # eb45049a on 2025-07-03
│       └── mocks/                                                         # dc7c182a on 2025-07-04
│           └── MockNotificationService.ts (0 dependencies)                # dc7c182a on 2025-07-04
└── tests/                                                                 # d91c6841 on 2025-07-09
    ├── CLAUDE.md                                                          # 477e945d on 2025-07-02
    ├── README.md                                                          # 477e945d on 2025-07-02
    ├── extensions-integration.test.ts (0 dependencies)                    # eb45049a on 2025-07-03
    ├── run-extension-tests.ts (0 dependencies)                            # 4babfce6 on 2025-07-03
    ├── setup.test.ts (0 dependencies)                                     # 5616e7d9 on 2025-07-02
    ├── test_watch_file.txt                                                # 70be6ef4 on 2025-06-30
    ├── behavior/                                                          # d91c6841 on 2025-07-09
    │   ├── CLAUDE.md                                                      # ce76bbff on 2025-07-01
    │   ├── README.md                                                      # b4172d12 on 2025-07-01
    │   ├── backward_compatibility.test.ts (5 dependencies)                # 12c240e1 on 2025-07-03
    │   │       ├→ ../../src/proxy.ts
    │   │       ├→ ./test_helper.ts
    │   │       ├→ ../mocks/MockFileSystem.ts
    │   │       ├→ ../mocks/MockProcessManager.ts
    │   │       └→ ../../src/cli-utils.ts
    │   ├── capability_injection.test.ts (0 dependencies)                  # d91c6841 on 2025-07-09
    │   ├── cli_watch_parsing.test.ts (0 dependencies)                     # 12c240e1 on 2025-07-03
    │   ├── docker_container_tracking.test.ts (0 dependencies)             # 83a3e80c on 2025-07-07
    │   ├── error_handling.test.ts (0 dependencies)                        # 2b272b72 on 2025-07-01
    │   ├── error_scenarios.test.ts (0 dependencies)                       # 950818b8 on 2025-07-02
    │   ├── generic_interfaces.test.ts (0 dependencies)                    # a9c46ee8 on 2025-07-02
    │   ├── global.d.ts (0 dependencies)                                   # 3c4a8b67 on 2025-07-01
    │   ├── initialization_replay.test.ts (0 dependencies)                 # 5c423762 on 2025-07-01
    │   ├── logging_state.test.ts (0 dependencies)                         # d9bed2c6 on 2025-07-09
    │   ├── mcpmon-logger.test.ts (1 dependency)                           # d9bed2c6 on 2025-07-09
    │   │       └→ ../../src/mcpmon-logger.ts
    │   ├── message_buffering.test.ts (0 dependencies)                     # 5c423762 on 2025-07-01
    │   ├── mixed_watch_targets.test.ts (1 dependency)                     # 12c240e1 on 2025-07-03
    │   │       └→ ../../src/cli-utils.ts
    │   ├── orphaned_container_cleanup.test.ts (0 dependencies)            # 83a3e80c on 2025-07-07
    │   ├── proxy_extensions.test.ts (0 dependencies)                      # eb45049a on 2025-07-03
    │   ├── proxy_restart.test.ts (0 dependencies)                         # a9c46ee8 on 2025-07-02
    │   ├── reload-tool.test.ts (0 dependencies)                           # d91c6841 on 2025-07-09
    │   └── test_helper.ts (2 dependencies)                                # eb45049a on 2025-07-03
    │           ├→ ../mocks/MockProcessManager.ts
    │           └→ ../mocks/MockFileSystem.ts
    ├── extensions/                                                        # d91c6841 on 2025-07-09
    │   ├── large-response-handler-di.test.ts (0 dependencies)             # d49476eb on 2025-07-06
    │   ├── large-response-handler-env.test.ts (0 dependencies)            # 64e1fcd2 on 2025-07-08
    │   ├── large-response-handler-integration.test.ts (0 dependencies)    # 2811826c on 2025-07-07
    │   ├── large-response-handler-persistence.test.ts (0 dependencies)    # cc78f390 on 2025-07-07
    │   ├── large-response-handler-streaming.test.ts (0 dependencies)      # e0aaa6ce on 2025-07-03
    │   ├── large-response-handler.test.ts (0 dependencies)                # 2811826c on 2025-07-07
    │   └── registry.test.ts (2 dependencies)                              # d91c6841 on 2025-07-09
    │           ├→ ../../src/extensions/registry.ts
    │           └→ ../../src/extensions/interfaces.ts
    ├── fixtures/                                                          # eb45049a on 2025-07-03
    │   ├── CLAUDE.md                                                      # ce76bbff on 2025-07-01
    │   ├── mcp_server_v1.js (0 dependencies)                              # ada87253 on 2025-07-01
    │   └── streaming-server.js (0 dependencies)                           # eb45049a on 2025-07-03
    ├── integration/                                                       # 83a3e80c on 2025-07-07
    │   ├── cli.test.ts (0 dependencies)                                   # 20437dce on 2025-07-02
    │   ├── docker_session_isolation.test.ts (0 dependencies)              # 83a3e80c on 2025-07-07
    │   ├── docker_watch_decoupling.test.ts (0 dependencies)               # 12c240e1 on 2025-07-03
    │   └── node_implementations.test.ts (0 dependencies)                  # f0196589 on 2025-07-02
    ├── mocks/                                                             # 83a3e80c on 2025-07-07
    │   ├── CLAUDE.md                                                      # ce76bbff on 2025-07-01
    │   ├── MockChangeSource.ts (0 dependencies)                           # 83a3e80c on 2025-07-07
    │   ├── MockFileSystem.ts (0 dependencies)                             # a9c46ee8 on 2025-07-02
    │   └── MockProcessManager.ts (0 dependencies)                         # 431306a6 on 2025-07-01
    └── unit/                                                              # d9bed2c6 on 2025-07-09
        └── stderr-parser.test.ts (0 dependencies)                         # d9bed2c6 on 2025-07-09
```

### Key Directory Structure

- **`src/`**: Core application source code with modular architecture
  - **`extensions/`**: Hook-based extension system with built-in extensions
  - **`node/`**: Node.js-specific platform implementations
  - **`testing/`**: Comprehensive DI-based testing framework
- **`tests/`**: Test suites organized by type (behavior, integration, extensions)
- **`docs/`**: Complete documentation including API, architecture, and testing guides
- **`example-extension/`**: Reference extension implementation with comprehensive test patterns
- **`examples/`**: Usage examples for different MCP server implementations
- **`data/lrh/`**: Large Response Handler extension data storage with date-based organization

## Key Architecture Concepts

### Generic Interface System (NEW)

mcpmon has evolved beyond file-watching to support monitoring any type of resource through a generic interface system. This architecture enables extensible monitoring of files, packages, APIs, hosted services, and custom resources.

#### ChangeSource Interface
The **ChangeSource** interface provides a unified abstraction for monitoring different types of resources:

```typescript
interface ChangeSource {
  // Watch resources for changes - files, packages, URLs, etc.
  watch(paths: string[]): AsyncIterable<ChangeEvent>;
  
  // Read/write operations for resource content
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  copyFile(src: string, dest: string): Promise<void>;
}
```

**Key Benefits:**
- **Resource Agnostic**: Monitor files, package registries, APIs, or custom resources
- **Consistent Interface**: Same API regardless of resource type
- **Extensible**: Implement custom ChangeSource for any monitoring scenario
- **Async Iteration**: Clean, memory-efficient event streaming

#### ChangeEvent System
The **ChangeEvent** system provides extensible event types supporting different monitoring scenarios:

```typescript
interface ChangeEvent {
  type: ChangeEventType;      // Type of change that occurred
  path: string;               // Resource identifier (file path, package name, URL, etc.)
  metadata?: Record<string, any>;  // Optional context about the change
}

type ChangeEventType = 
  | "create" | "modify" | "remove"           // File operations
  | "version_update" | "dependency_change"; // Package monitoring
```

**Supported Event Types:**
- **File Operations**: `create`, `modify`, `remove` for filesystem changes
- **Package Monitoring**: `version_update`, `dependency_change` for package registry changes
- **Extensible**: New event types can be added for custom monitoring scenarios
- **Metadata Support**: Optional context data for complex change scenarios

#### watchTargets Array-Based Monitoring
The **watchTargets** array replaces the single `entryFile` approach, enabling multi-resource monitoring:

```typescript
interface MCPProxyConfig {
  watchTargets?: string[];  // Array of resources to monitor
  entryFile?: string;       // @deprecated - use watchTargets instead
}
```

**Features:**
- **Multi-Resource**: Monitor multiple files, directories, or resources simultaneously
- **Auto-Detection**: Automatically detects script files from command arguments when no targets specified
- **Flexible Identifiers**: Support file paths, package names, URLs, or custom resource identifiers
- **Zero Configuration**: Works without explicit configuration for common use cases

**Example Usage:**
```typescript
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: [
    'server.js',           // Main server file
    'package.json',        // Package configuration
    'config/*.json',       // Configuration files
    'npm:lodash',          // Package dependency (hypothetical)
    'https://api.service.com/schema'  // Remote API schema (hypothetical)
  ]
});
```

#### Backward Compatibility
The generic interface system maintains full backward compatibility through automatic adapters:

**FileSystem→ChangeSource Adapter:**
```typescript
// Automatically converts FileSystem implementations to ChangeSource
private createFileSystemAdapter(fs: FileSystem): ChangeSource {
  return {
    async *watch(paths: string[]): AsyncIterable<ChangeEvent> {
      for await (const fileEvent of fs.watch(paths)) {
        // Convert FileEvent to ChangeEvent
        const changeEvent: ChangeEvent = {
          type: fileEvent.type as ChangeEventType,
          path: fileEvent.path,
        };
        yield changeEvent;
      }
    },
    // ... other methods delegated to FileSystem
  };
}
```

**entryFile→watchTargets Migration:**
```typescript
// Automatic migration from legacy entryFile to watchTargets array
private normalizeConfig(config: MCPProxyConfig): MCPProxyConfig {
  if (!config.watchTargets && config.entryFile) {
    config.watchTargets = [config.entryFile];
  }
  return config;
}
```

**Compatibility Guarantees:**
- **Existing Code**: All existing FileSystem implementations continue to work
- **Legacy Config**: Old `entryFile` configuration automatically converted to `watchTargets`
- **API Stability**: Deprecated interfaces maintained with clear migration paths
- **Zero Breaking Changes**: Upgrade path preserves all existing functionality

### Core Components
- **MCPProxy** (`src/proxy.ts`): Main proxy implementation with dependency injection
- **Platform Interfaces** (`src/interfaces.ts`): Abstract interfaces for cross-platform compatibility  
- **Node.js Implementations** (`src/node/`): Platform-specific implementations
- **CLI Interface** (`src/cli.ts`): Simple nodemon-like command wrapper

## Usage Patterns

```bash
# CLI usage (primary)
mcpmon node server.js
mcpmon python server.py
mcpmon deno run --allow-all server.ts

# Library usage (new capability)
import { createMCPProxy } from 'mcpmon';
const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: ['server.js', 'config.json']
});
```

## Development Context

### Recent Major Changes (v0.3.x)
1. **Renamed to mcpmon**: Simplified from `mcp-server-hmr` to `mcpmon`
2. **Nodemon-like CLI**: Simple command wrapping instead of config-based approach
3. **Zero Configuration**: Auto-detects files to watch from command arguments
4. **Library Support**: Can be imported as a dependency for custom monitoring solutions
5. **Improved Testing**: Comprehensive test coverage with behavioral and integration tests

### Migration History
- **v0.3.0**: Renamed from `mcp-server-hmr` to `mcpmon`, simplified CLI to nodemon-like interface
- **v0.2.0**: Migrated from Deno to Node.js implementation
- **v0.1.0**: Initial Deno implementation

### Key Files
- `package.json`: npm package configuration with global CLI binary
- `tsconfig.json`: TypeScript configuration for Node.js targeting
- `jest.config.js`: Test configuration using Jest framework
- `src/index.ts`: Main entry point and library exports
- `src/cli.ts`: CLI implementation with auto-detection logic

### Testing Philosophy

#### Dependency Injection Testing Principles

mcpmon employs a comprehensive dependency injection (DI) architecture that enables systematic testing of complex, long-running systems. The DI-based testing approach follows these core principles:

**Interface-First Design**: All components depend on abstractions rather than concrete implementations, enabling complete isolation and substitution during testing.

**Behavioral Verification**: Tests verify component behavior through interfaces rather than implementation details, ensuring tests remain stable across refactoring.

**Controlled Dependencies**: All external dependencies (filesystem, process management, network) are injected, allowing precise control over test conditions.

**State Isolation**: Each test receives fresh dependency instances, preventing state contamination between test scenarios.

#### Three-Tier Testing Strategy

The testing architecture implements a three-tier strategy that matches mcpmon's operational profile as a long-running proxy system:

**Tier 1: Feature Tests**
- **Purpose**: Verify individual features in isolation
- **Lifecycle**: Fresh application instance per test
- **Duration**: Milliseconds to seconds
- **Implementation**: Standard Jest tests with fresh mock implementations
- **Focus**: Functional correctness and edge case handling

**Tier 2: System Lifecycle Tests**
- **Purpose**: Test system behavior over extended operation periods
- **Lifecycle**: Single long-running instance across multiple operations
- **Duration**: Minutes to hours
- **Implementation**: DI test framework with soak test runner
- **Focus**: State management, resource accumulation, system stability

**Tier 3: Endurance Tests**
- **Purpose**: Detect slow leaks, performance degradation, and long-term stability issues
- **Lifecycle**: Single instance running for days
- **Environment**: Nightly CI runs and extended development testing
- **Focus**: Resource usage patterns, memory stability, performance consistency

#### Interface-Based Testing Approach

The interface-based testing approach provides complete control over test environments while maintaining realistic system behavior:

**ChangeSource Interface Testing**: All monitoring functionality is tested through the `ChangeSource` interface, enabling testing of file watching, package monitoring, and custom resource scenarios without actual external dependencies.

**Process Management Testing**: Server lifecycle, restart behavior, and signal handling are tested through the `ProcessManager` interface with mock implementations that simulate real process states.

**Platform Abstraction Testing**: Cross-platform compatibility is verified through platform interface mocks, ensuring consistent behavior across different operating systems.

**Message Flow Testing**: MCP protocol handling and message buffering are tested through interface-based message transports, enabling precise control over network conditions and failure scenarios.

#### Mock Implementations and Test Helpers

The testing architecture includes comprehensive mock implementations and test helpers to support the DI-based approach:

**Mock Directory Structure**:
- `tests/mocks/`: Complete mock implementations of all platform interfaces
- `tests/behavior/`: Behavioral test helpers for common testing patterns
- `tests/extensions/`: Extension-specific test utilities and long-running test frameworks

**Test Helper Pattern**: The `tests/behavior/test-helper.ts` module provides DRY (Don't Repeat Yourself) utilities for:
- Dependency injection setup and teardown
- Common test scenarios and assertions
- Mock configuration and state management
- Resource cleanup and test isolation

**Mock Implementation Quality**: All mock implementations maintain full interface compatibility and support both simple test scenarios and complex long-running system tests through configurable behavior patterns.

## Testing Architecture

### Long-Running Systems Testing Philosophy

Tests should match the operational profile of the software, not just its functional requirements. For mcpmon (a long-running proxy that persists for the lifetime of Claude Desktop):
- It doesn't restart between operations
- It accumulates state over time  
- It must handle resource constraints
- It needs self-healing capabilities

### Three-Tier Testing Strategy

#### Tier 1: Feature Tests
- **Purpose**: Test individual features in isolation
- **Lifecycle**: Fresh application instance per test
- **Duration**: Milliseconds to seconds
- **Implementation**: Standard Jest tests with fresh mocks

#### Tier 2: System Lifecycle Tests
- **Purpose**: Test system behavior over extended operation
- **Lifecycle**: Single long-running instance
- **Duration**: Minutes to hours
- **Implementation**: DI Test Framework soak test runner (`tests/extensions/large-response-handler-di.test.ts`)

#### Tier 3: Endurance Tests
- **Purpose**: Detect slow leaks and degradation
- **Lifecycle**: Single instance for days
- **Environment**: Nightly CI runs
- **Focus**: Resource usage, performance stability

### System Health Patterns

#### Preventative Measures
1. **Resource Bounds** - Limit buffer sizes, connection counts
2. **Circuit Breakers** - Prevent cascade failures
3. **Periodic Cleanup** - Proactive maintenance routines
4. **Immutable State** - Prevent corruption through defensive copying

#### Treatment Patterns
1. **Self-Healing** - Automatic recovery when problems detected
2. **Graceful Degradation** - Reduce functionality to maintain stability
3. **State Preservation** - Save/restore critical state across restarts
4. **Managed Restarts** - Graceful shutdown with connection draining

#### Diagnostic Patterns
1. **Multi-Level Health Checks** - Liveness, readiness, detailed health
2. **Structured Observability** - Metrics, logs, traces with correlation
3. **State Inspection APIs** - Expose internal state safely
4. **Resource Monitoring** - Track memory, connections, performance

### Key Testing Principles

1. **Testing Philosophy**: Tests should simulate the actual operational lifecycle, not idealized scenarios
2. **State Management**: Long-running systems need explicit state boundaries and cleanup strategies
3. **Observability First**: You cannot treat what you cannot diagnose
4. **Design for Longevity**: Build systems that maintain themselves over time

### Future Vision
mcpmon is designed to support monitoring beyond files - package registries, APIs, hosted services. The generic interface system enables custom ChangeSource implementations for any monitoring scenario.

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Clean, build, and run full test suite
npm run test:watch   # TDD mode (no rebuild)
npm run lint         # Check code quality
npm link             # Link for local development
```

## Architecture Notes

- **Platform Agnostic**: Uses dependency injection with platform-specific implementations
- **Zero Configuration**: Auto-detects files to watch from command arguments
- **Message Buffering**: Prevents loss during server restarts
- **Graceful Lifecycle**: Proper SIGTERM→SIGKILL shutdown sequence
- **Cross-Platform**: Windows, macOS, Linux support through Node.js