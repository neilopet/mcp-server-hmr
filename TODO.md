# MCP Server HMR - Implementation Roadmap

## Research Phase (Priority: Critical)

### RESEARCH-1: MCP Protocol Schema Analysis
- **Goal**: Understand exact message format and JSON-RPC requirements
- **Source**: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/heads/main/schema/2025-06-18/schema.ts
- **Key Questions**:
  - What are the exact message types and formats?
  - How are request/response pairs matched?
  - What's the initialization handshake sequence?
  - Are there any special message types that affect buffering?

### RESEARCH-2: MCP Architecture Documentation
- **Goal**: Understand client/server roles and connection lifecycle
- **Source**: https://modelcontextprotocol.io/specification/2025-06-18/architecture
- **Key Questions**:
  - What's the expected connection lifecycle?
  - How do clients handle server disconnections?
  - What state must be preserved during restart?
  - Are there any protocol-level keepalive mechanisms?

### RESEARCH-3: MCP Transport Specification
- **Goal**: Focus on stdio transport implementation details
- **Source**: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- **Key Questions**:
  - How are messages framed over stdio?
  - Is it newline-delimited JSON?
  - How are errors propagated?
  - What happens with partial messages?

### RESEARCH-4: Current Implementation's Buffering Strategy
- **Goal**: Understand how the Deno version handles message queuing
- **Source**: /Users/neilopet/Code/claude-live-reload/src/main.ts
- **Key Areas**:
  - How are messages buffered during restart?
  - How is the initialization sequence replayed?
  - What prevents message loss or duplication?
  - How are partial messages handled?

### RESEARCH-5: Node.js Stdio Stream Handling
- **Goal**: Understand best practices for child process stdio
- **Key Topics**:
  - child_process.spawn() stdio options
  - Proper use of pipe() vs manual reading
  - Backpressure handling
  - Clean process shutdown patterns

### RESEARCH-6: JSON-RPC Message Parsing in Node.js
- **Goal**: Determine best approach for message framing
- **Options to Evaluate**:
  - readline module for newline-delimited JSON
  - Manual buffering with Buffer.concat()
  - Transform streams for parsing
  - Existing JSON-RPC libraries compatibility

## Branch Management

### BRANCH-1: Create mcp-server-hmr-deno branch
- **Purpose**: Preserve current Deno implementation before refactoring
- **Actions**:
  - Create branch from current main
  - Document that this is the Deno reference implementation
  - No further development on this branch

## Phase 1: Interface Extraction (Deno Refactoring)

### Parallel Execution Groups:

#### Group 1A (Prerequisites):
- Create mcp-server-hmr-deno branch to preserve current implementation

#### Group 1B (Interface Definitions - Run in Parallel):
- **Task 1**: Define ProcessManager interface in src/interfaces.ts
- **Task 2**: Define ManagedProcess interface in src/interfaces.ts  
- **Task 3**: Define FileSystem interface in src/interfaces.ts

#### Group 1C (Deno Implementations - After Group 1B):
- **Task 4**: Create DenoProcessManager.ts (wraps Deno.Command)
- **Task 5**: Create DenoFileSystem.ts (wraps Deno file APIs)

#### Group 1D (Core Refactoring - After Group 1C):
- **Task 6**: Refactor MCPProxy constructor for dependency injection
- **Task 7**: Update MCPProxy.startServer() to use ProcessManager
- **Task 8**: Update MCPProxy file watching to use FileSystem
- **Task 9**: Update main.ts to wire everything together
- **Task 10**: Refactor config_launcher.ts (can run parallel to MCPProxy tasks)

#### Group 1E (Verification):
- **Task 11**: Run existing tests to verify no behavioral changes

## Phase 2: Behavioral Test Suite

### Parallel Execution Groups:

#### Group 2A (Test Infrastructure):
- **Task 12**: Create tests/behavior/ directory structure

#### Group 2B (Mock Implementations - After Group 2A):
- **Task 13**: Create MockProcessManager.ts (run in parallel)
- **Task 14**: Create MockFileSystem.ts (run in parallel)

#### Group 2C (Behavioral Tests - After Group 2B):
- **Task 15**: Write proxy_restart.test.ts (run in parallel)
- **Task 16**: Write message_buffering.test.ts (run in parallel)
- **Task 17**: Write initialization_replay.test.ts (run in parallel)
- **Task 18**: Write error_handling.test.ts (run in parallel)
- **Task 19**: Write config_transformation.test.ts (run in parallel)

#### Group 2D (Coverage Verification):
- **Task 20**: Generate coverage report showing >80% coverage

## Phase 3A: Complete Deno Implementation

### 3.1: Documentation
- Add JSDoc comments to all interfaces
- Document error handling contracts
- Create architecture diagram

### 3.2: Verification & Commit
- Run all behavioral tests
- Verify no regression
- Commit to main with detailed message

## Phase 3B: Node.js Rewrite

### Parallel Execution Groups:

#### Group 3A (Branch & Setup):
- **Task 24**: Create mcp-server-hmr-node branch from main

#### Group 3B (Project Configuration - After Group 3A):
- **Task 25**: Initialize Node.js project structure (run in parallel)
- **Task 26**: Configure tsconfig.json for Node.js (run in parallel)

#### Group 3C (Foundation):
- **Task 27**: Copy src/interfaces.ts and tests/behavior/ from Deno

#### Group 3D (Node.js Implementations - After Group 3C):
- **Task 28**: Create NodeProcessManager.ts (run in parallel)
- **Task 29**: Implement NodeProcessManager stream handling (run in parallel) 
- **Task 30**: Create NodeFileSystem.ts (run in parallel)

#### Group 3E (Core Logic - After Group 3D):
- **Task 31**: Port MCPProxy class to Node.js idioms
- **Task 32**: Create CLI with commander.js (can run parallel to MCPProxy)

#### Group 3F (Testing):
- **Task 33**: Configure Jest and run behavioral tests

## Phase 4: Package & Distribution

### 4.1: npm Package Configuration
- Configure package.json exports
- Set up TypeScript build
- Create CLI entry point

### 4.2: Testing & Examples
- Test via npm link
- Create programmatic usage examples
- Document migration from Deno version

## Phase 5: Release

### 5.1: Documentation
- Comprehensive README
- Migration guide
- API documentation

### 5.2: Publishing
- Publish to npm as mcp-server-hmr
- Archive Deno version with notice

## Phase 6: Blue-Green Deployment Enhancement

### 6.1: Architecture Refactoring
- **Goal**: Implement zero-downtime server switching using blue-green pattern
- **Current State**: Sequential restart with ~3 second downtime
- **Target State**: Overlapping server lifecycle with atomic switch

### 6.2: Core Implementation Tasks
1. **Refactor MCPProxy to support dual server instances**:
   - Add `activeServer` and `pendingServer` properties
   - Track which server instance each request was routed to
   - Implement request/response correlation map

2. **Implement parallel server startup**:
   - Start new server while old server still running
   - Initialize new server in background
   - Wait for successful initialization before switching

3. **Build atomic routing switch mechanism**:
   - Queue messages during switch moment
   - Atomically update `activeServer` reference
   - Ensure no message reordering during switch

4. **Implement connection draining**:
   - Track in-flight requests to old server
   - Continue routing responses from old server
   - Implement drain timeout (default 30s)

5. **Graceful old server shutdown**:
   - Wait for all pending requests to complete
   - Send shutdown notification if server supports it
   - Multi-stage kill sequence after drain

### 6.3: Message Routing Logic
- **Request Routing**: 
  - Before switch: Route to old server
  - During switch: Buffer briefly
  - After switch: Route to new server
  
- **Response Routing**:
  - Match response ID to request tracking map
  - Route response from correct server instance
  - Clean up tracking map after response

### 6.4: Error Handling
- New server fails to start: Keep old server active
- New server fails initialization: Rollback and retry
- Old server crashes during drain: Fast-track switch
- Both servers down: Enter recovery mode

### 6.5: Testing Strategy
- Test overlapping server lifecycles
- Test request/response correlation during switch
- Test drain timeout scenarios
- Test rollback on initialization failure
- Verify zero message loss

### 6.6: Monitoring & Metrics
- Track switch duration
- Monitor drain effectiveness
- Count dropped messages (should be 0)
- Measure initialization time

---

## Research Findings

### MCP Protocol Specifications

1. **Message Format**: Standard JSON-RPC 2.0 with newline-delimited JSON (NDJSON)
   - Each message is a complete JSON object on a single line
   - Messages separated by `\n` characters
   - UTF-8 encoding required
   - No embedded newlines allowed in messages

2. **Request/Response Correlation**: Uses `id` field for matching
   - Requests with `id` expect responses with matching `id`
   - Notifications (no `id`) don't expect responses
   - Responses can arrive out of order

3. **Initialization Handshake**:
   - Client sends `initialize` request with capabilities
   - Server responds with its capabilities
   - Client sends `initialized` notification
   - This sequence must be replayed after server restart

4. **Critical State to Preserve**:
   - Negotiated protocol version
   - Agreed-upon capabilities
   - Client/server info
   - Active request IDs

### Current Deno Implementation Analysis

1. **Buffering Strategy**:
   - Uses `messageBuffer: Message[]` to store parsed messages during restart
   - Controlled by `restarting` boolean flag
   - Captures and stores `initializeParams` for replay
   - Messages buffered in order and replayed sequentially

2. **Restart Sequence**:
   - Set `restarting = true`
   - Kill old server (SIGTERM)
   - Wait 1 second for process cleanup
   - Start new server
   - Replay initialization
   - Replay buffered messages
   - Wait 2 seconds for server readiness
   - Get tools list and send notification
   - Set `restarting = false`

3. **Stream Management**:
   - Three separate async functions for stdin/stdout/stderr
   - Line-based buffering for partial messages
   - Proper writer lock acquisition/release

### Node.js Implementation Recommendations

1. **Stream Architecture**:
   - Use Transform streams for NDJSON parsing/stringifying
   - Implement proper backpressure handling
   - Use AbortController for lifecycle management
   - Separate concerns with dedicated classes

2. **Process Management**:
   - Multi-stage graceful shutdown (IPC → SIGTERM → SIGKILL)
   - Verify process termination with signal 0
   - Handle Windows vs Unix signal differences
   - Use detached: false to keep child attached

3. **Message Buffering**:
   - Implement ring buffer with size limits
   - Track dropped messages
   - Async drain with backpressure support
   - Separate buffer for initialization replay

4. **Error Handling**:
   - Parse errors with line context
   - Request timeouts (30s recommended)
   - Process crash recovery
   - Graceful degradation

## Updated Interface Definitions

Based on research, the interfaces should use Node.js native types:

```typescript
interface ManagedProcess {
  readonly pid?: number;
  readonly stdin: Writable;    // Node.js Writable stream
  readonly stdout: Readable;   // Node.js Readable stream  
  readonly stderr: Readable;   // Node.js Readable stream
  readonly status: Promise<{code: number | null, signal: string | null}>;
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface ProcessManager {
  spawn(
    command: string, 
    args: string[], 
    options?: {
      env?: Record<string, string>;
      cwd?: string;
    }
  ): ManagedProcess;
}
```

## Implementation Notes

### Phase 1 Considerations:
- Keep interfaces using Deno types initially for compatibility
- Focus on structural refactoring without changing stream types
- Document the planned Node.js type conversions

### Phase 3B Critical Path:
1. Implement Transform streams for NDJSON parsing first
2. Build message buffer with ring buffer pattern
3. Use multi-stage shutdown for process management
4. Implement comprehensive error handling from day one

### Testing Strategy:
- Mock streams should simulate backpressure
- Test partial message handling
- Test buffer overflow scenarios
- Test process crash recovery
- Verify no message loss during restart