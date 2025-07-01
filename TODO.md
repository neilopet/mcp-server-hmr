# MCP Server HMR - Implementation Roadmap

## ✅ COMPLETED: Deno Implementation with Dependency Injection

### Research Phase ✅

- ✅ **RESEARCH-1**: MCP Protocol Schema Analysis - NDJSON with JSON-RPC 2.0
- ✅ **RESEARCH-2**: MCP Architecture Documentation - Client/server lifecycle understood
- ✅ **RESEARCH-3**: MCP Transport Specification - Stdio transport with newline framing
- ✅ **RESEARCH-4**: Current Buffering Strategy - Message buffer with initialization replay
- ✅ **RESEARCH-5**: Node.js Stdio Stream Handling - Child process patterns analyzed
- ✅ **RESEARCH-6**: JSON-RPC Message Parsing - Transform streams identified as optimal

### Phase 1: Interface Extraction ✅

- ✅ **Group 1A**: Created branch preservation strategy
- ✅ **Group 1B**: Defined ProcessManager, ManagedProcess, and FileSystem interfaces
- ✅ **Group 1C**: Implemented DenoProcessManager and DenoFileSystem
- ✅ **Group 1D**: Refactored MCPProxy with dependency injection
- ✅ **Group 1E**: Verified zero behavioral changes

### Phase 2: Behavioral Test Suite ✅

- ✅ **Group 2A**: Created tests/behavior/ infrastructure
- ✅ **Group 2B**: Implemented MockProcessManager and MockFileSystem
- ✅ **Group 2C**: Created comprehensive behavioral test suite
- ✅ **Group 2D**: Achieved >80% coverage on core logic

### Phase 3A: Deno Implementation Completion ✅

- ✅ **Documentation**: Added comprehensive JSDoc to all interfaces
- ✅ **Architecture**: Implemented dependency injection with I/O stream abstraction
- ✅ **Test Refactoring**: Created test_helper.ts pattern (~80% code reduction)
- ✅ **Documentation Updates**: Updated all docs to reflect new architecture
- ✅ **Verification**: All behavioral + integration tests passing

## 🚧 IN PROGRESS: Deployment and Node.js Implementation

### SEQUENTIAL-1: Deploy Deno Implementation

- 🔲 **SEQUENTIAL-1.1**: Run `deno task test` to verify all tests pass
- 🔲 **SEQUENTIAL-1.2**: Run `deno task lint` and `deno task format`
- 🔲 **SEQUENTIAL-1.3**: Stage all changes with `git add -A`
- 🔲 **SEQUENTIAL-1.4**: Create commit: `test: refactor behavioral tests with test_helper pattern (~80% code reduction)`
- 🔲 **SEQUENTIAL-1.5**: Push to remote with `git push origin main`

### SEQUENTIAL-2: Create Node.js Branch

- 🔲 **SEQUENTIAL-2.1**: Create branch `mcp-server-hmr-node` from main

## 📋 PENDING: Node.js Implementation (Parallel Tracks)

### PARALLEL-A: Node.js Project Setup

Can start immediately after SEQUENTIAL-2:

- 🔲 **PARALLEL-A.1**: Create package.json with ESM configuration
  ```json
  {
    "name": "mcp-server-hmr",
    "version": "0.1.0",
    "type": "module",
    "engines": { "node": ">=18.0.0" }
  }
  ```
- 🔲 **PARALLEL-A.2**: Add runtime dependencies
  ```json
  "dependencies": {
    "chokidar": "^3.5.3",
    "commander": "^11.1.0"
  }
  ```
- 🔲 **PARALLEL-A.3**: Add dev dependencies
  ```json
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "jest": "^29.7.0",
    "@jest/globals": "^29.7.0",
    "ts-jest": "^29.1.1"
  }
  ```
- 🔲 **PARALLEL-A.4**: Add npm scripts
  ```json
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "tsc --noEmit",
    "dev": "node --watch dist/cli.js"
  }
  ```
- 🔲 **PARALLEL-A.5**: Create tsconfig.json for Node.js ESM
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "declaration": true,
      "declarationMap": true
    }
  }
  ```
- 🔲 **PARALLEL-A.6**: Run `npm install` and verify setup

### PARALLEL-B: Copy Core Files

Can start immediately after SEQUENTIAL-2:

- 🔲 **PARALLEL-B.1**: Copy src/interfaces.ts preserving all type definitions
- 🔲 **PARALLEL-B.2**: Create tests/behavior/ directory structure
- 🔲 **PARALLEL-B.3**: Copy behavioral tests, convert assertions:
  - `assertEquals(a, b)` → `expect(a).toBe(b)`
  - `assertExists(a)` → `expect(a).toBeTruthy()`
  - `assertRejects(fn)` → `expect(fn).rejects.toThrow()`
- 🔲 **PARALLEL-B.4**: Copy test_helper.ts, update imports only
- 🔲 **PARALLEL-B.5**: Copy mocks directory unchanged

### PARALLEL-C: Node.js Implementations

Depends on PARALLEL-B.1 completion:

- 🔲 **PARALLEL-C.1**: Create src/node/NodeProcessManager.ts
  ```typescript
  import { ChildProcess, spawn } from "child_process";
  import { Readable, Writable } from "stream";
  import { ManagedProcess, ProcessManager } from "../interfaces.js";
  ```
- 🔲 **PARALLEL-C.2**: Implement spawn() method
  - Convert Node.js streams to Web Streams API
  - Handle ChildProcess wrapper as ManagedProcess
- 🔲 **PARALLEL-C.3**: Implement kill() with signal handling
  - SIGTERM with 10s timeout
  - SIGKILL fallback
  - Windows process tree termination
- 🔲 **PARALLEL-C.4**: Implement stream converters
  ```typescript
  function toWebReadableStream(nodeStream: Readable): ReadableStream<Uint8Array>;
  function toWebWritableStream(nodeStream: Writable): WritableStream<Uint8Array>;
  ```
- 🔲 **PARALLEL-C.5**: Add error handling and cleanup
  - ENOENT for missing commands
  - Zombie process prevention
  - Status promise implementation

- 🔲 **PARALLEL-C.6**: Create src/node/NodeFileSystem.ts
  ```typescript
  import { watch } from "chokidar";
  import { access, readFile, writeFile } from "fs/promises";
  import { FileEvent, FileSystem } from "../interfaces.js";
  ```
- 🔲 **PARALLEL-C.7**: Implement watch() with chokidar
  - Map events: add/change → modify, unlink → remove
  - Handle recursive directory watching
- 🔲 **PARALLEL-C.8**: Create async generator for events
  ```typescript
  async *watch(paths: string[]): AsyncIterable<FileEvent> {
    const watcher = chokidar.watch(paths);
    // Yield FileEvent objects
  }
  ```
- 🔲 **PARALLEL-C.9**: Implement file operations
  - readFile/writeFile with UTF-8
  - Proper error handling
- 🔲 **PARALLEL-C.10**: Implement exists() and path utilities
  - Cross-platform path normalization
  - access() for existence check

### PARALLEL-D: Jest Configuration

Depends on PARALLEL-B completion:

- 🔲 **PARALLEL-D.1**: Create jest.config.js
  ```javascript
  export default {
    preset: "ts-jest",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
      "^(\\.{1,2}/.*)\\.js$": "$1",
    },
  };
  ```
- 🔲 **PARALLEL-D.2**: Configure ESM support
  ```javascript
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }]
  },
  testMatch: ['**/tests/behavior/**/*.test.ts']
  ```
- 🔲 **PARALLEL-D.3**: Create test setup file
- 🔲 **PARALLEL-D.4**: Update test syntax for Jest
  ```typescript
  // Deno.test() → describe()/it()
  describe("Proxy restart", () => {
    it("should restart on file change", async () => {
      // test code
    });
  });
  ```
- 🔲 **PARALLEL-D.5**: Run tests with Node.js implementations

## 📋 SEQUENTIAL: Core Implementation

### SEQUENTIAL-3: Port MCPProxy

Depends on PARALLEL-C completion:

- 🔲 **SEQUENTIAL-3.1**: Create src/proxy.ts with Node.js streams
  ```typescript
  import { pipeline, Transform } from "stream";
  import { MCPProxyConfig, ProxyDependencies } from "./interfaces.js";
  ```
- 🔲 **SEQUENTIAL-3.2**: Implement NDJSON Transform stream
  ```typescript
  class NDJSONParser extends Transform {
    _transform(chunk, encoding, callback) {
      // Parse newline-delimited JSON
    }
  }
  ```
- 🔲 **SEQUENTIAL-3.3**: Port message buffering logic
- 🔲 **SEQUENTIAL-3.4**: Port initialization capture/replay
- 🔲 **SEQUENTIAL-3.5**: Add comprehensive error handling

### SEQUENTIAL-4: CLI Implementation

- 🔲 **SEQUENTIAL-4.1**: Create src/cli.ts with commander
- 🔲 **SEQUENTIAL-4.2**: Implement `--server` command
- 🔲 **SEQUENTIAL-4.3**: Implement `--list` command
- 🔲 **SEQUENTIAL-4.4**: Implement `--setup` command
- 🔲 **SEQUENTIAL-4.5**: Add shebang and executable setup

### SEQUENTIAL-5: NPM Package Configuration

- 🔲 **SEQUENTIAL-5.1**: Set main: 'dist/index.js'
- 🔲 **SEQUENTIAL-5.2**: Set types: 'dist/index.d.ts'
- 🔲 **SEQUENTIAL-5.3**: Configure bin field
  ```json
  "bin": {
    "mcp-hmr": "dist/cli.js",
    "watch": "dist/cli.js"
  }
  ```
- 🔲 **SEQUENTIAL-5.4**: Configure files field
- 🔲 **SEQUENTIAL-5.5**: Add prepublishOnly script

### SEQUENTIAL-6: Library Entry Point

- 🔲 **SEQUENTIAL-6.1**: Create src/index.ts
- 🔲 **SEQUENTIAL-6.2**: Export implementations
- 🔲 **SEQUENTIAL-6.3**: Export interfaces
- 🔲 **SEQUENTIAL-6.4**: Add usage examples
- 🔲 **SEQUENTIAL-6.5**: Build and verify

### SEQUENTIAL-7: Testing & Validation

- 🔲 **SEQUENTIAL-7.1**: npm link for local testing
- 🔲 **SEQUENTIAL-7.2**: Test CLI globally
- 🔲 **SEQUENTIAL-7.3**: Test library import
- 🔲 **SEQUENTIAL-7.4**: E2E integration test
- 🔲 **SEQUENTIAL-7.5**: Verify package contents

## 🔮 OPTIONAL: Enhancements

### Optional Fixes

- 🔲 **OPTIONAL-FIX-6.1**: Add waitForSpawn() to MockProcessManager
- 🔲 **OPTIONAL-FIX-6.2**: Update test_helper to use waitForSpawn()
- 🔲 **OPTIONAL-FIX-6.3**: Add event emitter pattern

### Optional Examples

- 🔲 **OPTIONAL-EXAMPLE-1**: Programmatic usage example
- 🔲 **OPTIONAL-EXAMPLE-2**: npx auto-update example
- 🔲 **OPTIONAL-EXAMPLE-3**: Custom ProcessManager example

### Optional Documentation

- 🔲 **OPTIONAL-README-1**: Comprehensive Node.js README
- 🔲 **OPTIONAL-README-2**: Migration guide from Deno
- 🔲 **OPTIONAL-README-3**: API documentation

### Optional Publishing

- 🔲 **OPTIONAL-PUBLISH-1**: npm publish dry run
- 🔲 **OPTIONAL-PUBLISH-2**: Set npm credentials
- 🔲 **OPTIONAL-PUBLISH-3**: Publish to npm registry

## Implementation Notes

### Critical Success Factors

1. **Stream Handling**: Must properly convert between Node.js and Web Streams
2. **Process Management**: Multi-stage shutdown crucial for reliability
3. **Message Integrity**: Zero message loss during restart
4. **Test Parity**: All behavioral tests must pass unchanged

### Known Challenges

1. **ESM in Node.js**: Requires .js extensions in imports
2. **Stream Backpressure**: Must handle properly to avoid memory issues
3. **Windows Support**: Different signal handling required
4. **Jest + TypeScript + ESM**: Complex configuration needed

### Dependencies Between Tracks

```
SEQUENTIAL-1 (Deploy)
    ↓
SEQUENTIAL-2 (Branch)
    ↓
┌─────────────┬─────────────┐
│ PARALLEL-A  │ PARALLEL-B  │
│ (Setup)     │ (Copy)      │
└─────────────┴──────┬──────┘
                     ↓
         ┌───────────┴───────────┐
         │ PARALLEL-C │ PARALLEL-D│
         │ (Impl)     │ (Jest)   │
         └───────────┬───────────┘
                     ↓
              SEQUENTIAL-3-7
              (Core → Test)
```

### Estimated Timeline

- **SEQUENTIAL-1**: 30 minutes
- **PARALLEL tracks**: 2-3 hours (can be done by multiple developers)
- **SEQUENTIAL-3-7**: 4-6 hours
- **Total**: ~1 day with parallel execution

---

## Phase 6: Future Enhancement - Blue-Green Deployment

### Overview

Implement zero-downtime server switching using blue-green deployment pattern. This would eliminate the ~3 second downtime during restarts.

### Key Components

1. **Dual Server Management**: Support two server instances simultaneously
2. **Request Correlation**: Track which server handles each request
3. **Atomic Switching**: Switch active server with zero message loss
4. **Connection Draining**: Gracefully complete in-flight requests
5. **Rollback Support**: Revert if new server fails initialization

### Implementation Strategy

- Refactor MCPProxy to support `activeServer` and `pendingServer`
- Implement request ID → server instance mapping
- Add connection draining with configurable timeout
- Support graceful degradation on failures

This enhancement would be implemented after the Node.js version is stable and published.
