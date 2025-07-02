# src/ - Core Source Code

## Purpose
Contains the main implementation of mcpmon's hot-reload proxy system. This directory implements the core business logic using dependency injection and platform-agnostic interfaces.

## Key Files

### Core Implementation
- **`proxy.ts`** - Main MCPProxy class with hot-reload logic, message buffering, and process management
- **`interfaces.ts`** - Platform-agnostic interfaces and type definitions for the entire system
- **`index.ts`** - Main entry point, exports public API for library usage
- **`cli.ts`** - Command-line interface implementation with auto-detection logic

### Platform-Specific (`node/`)
- **`node/NodeProcessManager.ts`** - Node.js implementation of ProcessManager interface
- **`node/NodeFileSystem.ts`** - Node.js implementation of FileSystem interface  
- **`node/index.ts`** - Exports Node.js platform implementations

## Architecture Patterns

### Dependency Injection
All components use constructor injection with interfaces:
```typescript
class MCPProxy {
  constructor(
    private deps: ProxyDependencies,  // Injected dependencies
    private config: MCPProxyConfig
  ) {}
}
```

### Generic Interface System (NEW)
The codebase now supports monitoring beyond just files:

```typescript
// New generic interface
interface ChangeSource {
  watch(paths: string[]): AsyncIterable<ChangeEvent>;
  // ... other methods
}

// Extended event types
type ChangeEventType = 
  | "create" | "modify" | "remove"        // File operations
  | "version_update" | "dependency_change"; // Package monitoring
```

### Backward Compatibility
Automatic adapter converts legacy FileSystem to new ChangeSource:
```typescript
private createFileSystemAdapter(fs: FileSystem): ChangeSource {
  // Converts FileEvent → ChangeEvent automatically
}
```

## Key Responsibilities

### MCPProxy (`proxy.ts`)
- **Message Proxying**: Transparent JSON-RPC forwarding between client and server
- **Hot Reload Logic**: File/resource change detection and server restart coordination  
- **Message Buffering**: Queue incoming messages during server restarts
- **Process Lifecycle**: Graceful server startup/shutdown with timeout handling
- **Tool Discovery**: Automatic tool list updates after restart

### Interfaces (`interfaces.ts`)
- **Abstract Interfaces**: ProcessManager, ChangeSource, FileSystem (legacy)
- **Type Definitions**: Configuration interfaces, event types, dependency injection contracts
- **Cross-Platform**: Enable testing with mocks and different platform implementations

### CLI (`cli.ts`)
- **Auto-Detection**: Automatically detect files to watch from command arguments
- **Environment Passthrough**: Forward all environment variables to server
- **Error Handling**: Graceful handling of invalid commands or missing files
- **Nodemon Compatibility**: Familiar command patterns for developers

## Development Notes

### Generic Monitoring
The system is designed to support monitoring beyond files:
- Package registries (npm, PyPI)
- APIs and webhooks  
- Database changes
- Custom resource types

### Testing Strategy
- All classes accept interfaces for easy mocking
- Platform-specific code isolated in `node/` directory
- Comprehensive behavioral tests in `../tests/behavior/`

### Configuration Evolution
- **Legacy**: Single `entryFile` string
- **Current**: `watchTargets` array with `entryFile` fallback
- **Future**: Mix of files, packages, APIs in `watchTargets`

### Performance Considerations
- Debounced restart logic prevents rapid successive restarts
- Efficient file watching using Node.js native APIs
- Message buffering with overflow protection
- Graceful cleanup of resources and timeouts

## Common Patterns

```typescript
// Interface implementation pattern
export class NodeFileSystem implements FileSystem {
  async watch(paths: string[]): AsyncIterable<FileEvent> {
    // Platform-specific implementation
  }
}

// Dependency injection pattern
const proxy = new MCPProxy({
  procManager: new NodeProcessManager(),
  changeSource: new CustomChangeSource(), // or fs adapter
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  exit: process.exit
}, config);
```

This architecture enables easy testing, platform portability, and extensibility for future monitoring scenarios.