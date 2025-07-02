# src/node/ - Node.js Platform Implementations

## Purpose
Contains Node.js-specific implementations of the platform-agnostic interfaces defined in `../interfaces.ts`. This directory isolates Node.js dependencies and enables cross-platform testing with mock implementations.

## Files

### Platform Implementations
- **`NodeProcessManager.ts`** - Node.js implementation of ProcessManager interface using child_process
- **`NodeFileSystem.ts`** - Node.js implementation of FileSystem interface using fs and fs.watch
- **`index.ts`** - Exports both implementations for easy importing

## Architecture Role

### Dependency Injection Target
These implementations are injected into MCPProxy during production usage:

```typescript
// Production setup (in cli.ts)
import { NodeProcessManager, NodeFileSystem } from './node/index.js';

const proxy = new MCPProxy({
  procManager: new NodeProcessManager(),
  fs: new NodeFileSystem(),  // Automatically adapted to ChangeSource
  // ... other deps
}, config);
```

### Interface Compliance
Each class implements the exact interface contract:

```typescript
// NodeProcessManager implements ProcessManager
export class NodeProcessManager implements ProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
    // Uses Node.js child_process.spawn()
  }
}

// NodeFileSystem implements FileSystem  
export class NodeFileSystem implements FileSystem {
  async *watch(paths: string[]): AsyncIterable<FileEvent> {
    // Uses Node.js fs.watch() and chokidar for cross-platform reliability
  }
}
```

## Key Implementation Details

### NodeProcessManager
- **Process Spawning**: Uses `child_process.spawn()` with proper stdio handling
- **Stream Wrapping**: Converts Node.js streams to Web Streams for interface compliance
- **Signal Handling**: Implements graceful SIGTERM → SIGKILL shutdown sequence
- **Cross-Platform**: Handles Windows/Unix signal differences

### NodeFileSystem
- **File Watching**: Uses `chokidar` library for reliable cross-platform file watching
- **Event Mapping**: Maps chokidar events to our FileEvent interface
- **Path Handling**: Normalizes paths and handles both files and directories
- **Error Handling**: Graceful handling of permission errors and invalid paths

## Integration with Generic Interface System

### Automatic Adaptation
The NodeFileSystem is automatically adapted to the new ChangeSource interface:

```typescript
// In MCPProxy constructor
if (dependencies.fs) {
  // Create adapter from FileSystem to ChangeSource
  this.changeSource = this.createFileSystemAdapter(dependencies.fs);
}
```

### Event Type Mapping
FileEvent types map directly to ChangeEvent types:
- `create` → `create`
- `modify` → `modify`  
- `remove` → `remove`

Future custom ChangeSource implementations could emit `version_update` or `dependency_change` events.

## Development Notes

### Testing Strategy
- These implementations are NOT used in tests
- Tests use mock implementations from `../../tests/mocks/`
- This enables fast, deterministic testing without real file I/O

### Dependencies
- **chokidar**: Cross-platform file watching
- **Node.js built-ins**: child_process, fs, path, util

### Platform Considerations
- **Windows**: Handles different signal behavior and path separators
- **macOS**: Leverages FSEvents for efficient file watching
- **Linux**: Uses inotify for file system events

### Future Extensibility
New platform implementations can be added:
- `src/deno/` - For Deno runtime support
- `src/bun/` - For Bun runtime support
- Custom implementations for specific deployment environments

## Common Patterns

```typescript
// Stream conversion pattern (Node → Web Streams)
const nodeReadable = childProcess.stdout;
const webReadable = new ReadableStream({
  start(controller) {
    nodeReadable.on('data', (chunk) => controller.enqueue(chunk));
    nodeReadable.on('end', () => controller.close());
  }
});

// Error handling pattern
try {
  const result = await operation();
  return result;
} catch (error) {
  // Convert Node.js errors to interface-compliant format
  throw new Error(`Operation failed: ${error.message}`);
}
```

This directory provides the "real world" implementations that make mcpmon work in production while maintaining the testable, platform-agnostic architecture.