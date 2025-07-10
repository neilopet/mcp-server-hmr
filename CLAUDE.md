# mcpmon - Hot-reload monitor for MCP servers

## Project Overview

mcpmon is a transparent proxy that sits between MCP clients (like Claude Desktop) and MCP servers, providing automatic hot-reload capabilities. It's designed to be like "nodemon but for MCP" - offering a simple, zero-configuration interface for development.

## Key Architecture Concepts

### Generic Interface System (NEW)
- **ChangeSource**: Generic interface for monitoring files, packages, APIs, or any resource
- **ChangeEvent**: Extensible event system supporting file operations and package monitoring
- **watchTargets**: Array-based monitoring replacing single `entryFile`
- **Backward Compatibility**: Automatic FileSystem→ChangeSource adapter

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
- **Dependency Injection**: All components use interfaces for testability
- **Mock Implementations**: Comprehensive mocks in `tests/mocks/`
- **Test Helpers**: DRY pattern with `tests/behavior/test_helper.ts`
- **TDD Coverage**: Behavioral tests verify functionality through interfaces

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