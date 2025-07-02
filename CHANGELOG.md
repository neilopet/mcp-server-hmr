# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Comprehensive Error Scenario Tests**: Added tests for server initialization failures, process errors, stream forwarding errors, and request timeouts
- **CLI Integration Tests**: Added tests for command-line interface including argument parsing, watch file auto-detection, and environment variable handling
- **Node Implementation Tests**: Added integration tests for NodeFileSystem and NodeProcessManager
- **Test Coverage Improvements**: Increased test coverage from ~32% to ~40% across all metrics

### Fixed

- **Timer Cleanup on Shutdown**: Fixed "worker process failed to exit gracefully" Jest warnings by properly cleaning up all timers and resources
- **Pending Request Cleanup**: Added proper cleanup of request timeouts during shutdown
- **Debounced Restart Clear**: Added clearing of debounced restart timer on shutdown

### Improved

- **Safer Clean Command**: Replaced dangerous `rm -rf dist` with cross-platform `rimraf dist` for safer directory removal
- **Test Build Safety**: Updated default `npm test` to always run clean and build first, preventing stale build testing
  - Developers can still use `npm run test:unit`, `test:integration`, or `test:watch` for faster iteration without rebuilding
  - Removed redundant `test:full` script as `npm test` now includes clean and build

### Changed

- **Documentation Updates**: Comprehensive update of all documentation to reflect current implementation
  - Fixed broken documentation links in README.md
  - Removed references to unimplemented generic interface system from API and architecture docs
  - Updated testing documentation to match current Jest setup
  - Fixed npm scripts and commands in CONTRIBUTING.md
  - Aligned all code examples with actual implementation

### Removed

- **Dead Code**: Removed unused type guard functions `isProcessManager()` and `isFileSystem()` from interfaces.ts

## [0.3.0] - 2025-07-02

### 🚨 BREAKING CHANGES

**Major Simplification: mcp-hmr → mcpmon**

This release dramatically simplifies the interface from complex config-based setup to a simple nodemon-like command-line interface. This is a **major breaking change** but makes the tool much easier to use.

#### Migration Guide for Existing Users

**Before (mcp-hmr):**
```bash
# Installation
npm install -g mcp-server-hmr

# Complex config-based usage
mcp-hmr --server my-server --config ~/.config/Claude/claude_desktop_config.json
mcp-hmr --setup my-server     # Automatic config modification
mcp-hmr --list               # List available servers

# Claude Desktop config
{
  "mcpServers": {
    "my-server": {
      "command": "mcp-hmr",
      "args": ["--server", "my-server", "--config", "/path/to/config.json"]
    }
  }
}
```

**After (mcpmon):**
```bash
# Installation
npm install -g mcpmon

# Simple nodemon-like usage
mcpmon node server.js
mcpmon python server.py
mcpmon deno run --allow-all server.ts

# Claude Desktop config
{
  "mcpServers": {
    "my-server": {
      "command": "mcpmon",
      "args": ["node", "server.js"],
      "env": { "API_KEY": "your-key" }
    }
  }
}
```

#### Key Changes

| Feature | Before (mcp-hmr) | After (mcpmon) |
|---------|------------------|----------------|
| **Interface** | Config-based `--server` flags | Direct `mcpmon <command> <args...>` |
| **Setup** | Required `mcpServers.json` config files | Zero configuration needed |
| **Usage** | `mcp-hmr --server my-server` | `mcpmon node server.js` |
| **File watching** | Manual config of watch paths | Auto-detected from command |
| **Environment** | Complex env var setup | Direct passthrough |
| **CLI similarity** | Custom interface | Like nodemon - familiar to developers |

#### Command Examples

**Node.js server:**
```bash
# Before
mcp-hmr --server my-node-server

# After  
mcpmon node server.js
```

**Python server:**
```bash
# Before
mcp-hmr --server my-python-server

# After
mcpmon python -m my_server
mcpmon python server.py --port 3000
```

**Deno server:**
```bash
# Before
mcp-hmr --server my-deno-server

# After
mcpmon deno run --allow-all server.ts
```

**With MCP Inspector:**
```bash
# Before
npx @modelcontextprotocol/inspector --config config.json --server my-server

# After
npx @modelcontextprotocol/inspector mcpmon node server.js
```

#### Environment Variables

**Before (mcp-hmr):**
Complex config files with server definitions.

**After (mcpmon):**
Simple environment variables for customization:
```bash
# Override file watching
MCPMON_WATCH="server.js,config.json" mcpmon node server.js

# Change restart delay
MCPMON_DELAY=2000 mcpmon node server.js

# Enable verbose logging
MCPMON_VERBOSE=1 mcpmon node server.js
```

#### Benefits of the New Approach

1. **Zero Configuration**: No config files needed - just wrap your server command
2. **Nodemon Familiarity**: Uses the same pattern as nodemon for instant recognition
3. **Automatic Detection**: Watches the right files without manual configuration
4. **Environment Passthrough**: All environment variables automatically passed to your server
5. **Simpler Installation**: One command, ready to use
6. **Universal Compatibility**: Works with any MCP server in any language

### Added

- **mcpmon Command**: New simple CLI interface like nodemon
- **Auto File Detection**: Automatically detects script files to watch (.js, .mjs, .ts, .py, .rb, .php)
- **Environment Passthrough**: All environment variables automatically passed through
- **Verbose Logging**: MCPMON_VERBOSE for detailed debugging output
- **Customizable Watching**: MCPMON_WATCH for custom file patterns
- **Configurable Delays**: MCPMON_DELAY for restart timing control

### Changed

- **Package Name**: Renamed from `mcp-server-hmr` to `mcpmon`
- **Binary Command**: Changed from `mcp-hmr` to `mcpmon`
- **CLI Interface**: Complete redesign from config-based to command wrapping
- **File Watching**: Auto-detection instead of manual configuration
- **Usage Pattern**: Now follows nodemon pattern: `mcpmon <command> <args...>`

### Removed

- **Config File Support**: No longer supports mcpServers.json config files
- **--setup Mode**: No automatic config file modification
- **--list Mode**: No server listing (not needed with new approach)
- **--server Flag**: No server name references (direct command usage)
- **--config Flag**: No config file loading
- **Config Auto-detection**: No searching for Claude Desktop configs
- **mcp-watch Alias**: Only mcpmon command available now

### Fixed

- **Simplified Onboarding**: From "configure config files" to "wrap your command"
- **Reduced Complexity**: 90% fewer CLI options and concepts
- **Improved Discoverability**: Clear analogy to nodemon makes usage obvious
- **Better Error Messages**: Clearer feedback when files can't be watched

### Migration Steps

1. **Update Installation:**
   ```bash
   npm uninstall -g mcp-server-hmr
   npm install -g mcpmon
   ```

2. **Update Claude Desktop Config:**
   Replace config-based server definitions with direct commands:
   ```json
   {
     "mcpServers": {
       "my-server": {
         "command": "mcpmon",
         "args": ["node", "/absolute/path/to/server.js"],
         "env": { "API_KEY": "your-key" }
       }
     }
   }
   ```

3. **Update MCP Inspector Usage:**
   ```bash
   npx @modelcontextprotocol/inspector mcpmon node server.js
   ```

4. **Test the New Interface:**
   ```bash
   # Try the new simplified command
   mcpmon node server.js
   
   # With verbose logging to see what's happening
   MCPMON_VERBOSE=1 mcpmon node server.js
   ```

The new mcpmon interface is dramatically simpler while maintaining all the hot-reload functionality you expect. Like nodemon, it "just works" without configuration.

## [0.2.0] - 2025-07-01

### 🚨 BREAKING CHANGES

**Major Migration: Deno → Node.js**

This release migrates the project from Deno to Node.js as the canonical implementation. This is a **major breaking change** that affects installation, usage, and development workflows.

#### Migration Guide for Existing Users

**Before (Deno):**
```bash
# Installation
git clone https://github.com/neilopet/claude-live-reload
cd claude-live-reload
deno task setup

# Usage
watch --server my-server
deno task start
```

**After (Node.js):**
```bash
# Installation
npm install -g mcp-server-hmr

# Usage
mcp-hmr --server my-server
npm start
```

#### New Installation Methods

1. **Global Installation (Recommended):**
   ```bash
   npm install -g mcp-server-hmr
   ```

2. **Development Setup:**
   ```bash
   git clone https://github.com/neilopet/claude-live-reload
   cd claude-live-reload
   npm install
   npm run build
   npm link
   ```

#### Command Changes

| Old Command (Deno) | New Command (Node.js) |
|-------------------|----------------------|
| `watch --server my-server` | `mcp-hmr --server my-server` |
| `watch --setup --all` | `mcp-hmr --setup --all` |
| `deno task start` | `npm start` |
| `deno task test` | `npm test` |
| `deno task lint` | `npm run lint` |
| `deno task format` | `npm run format` |

#### Configuration Updates

**Claude Desktop Config - Before:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "deno",
      "args": ["run", "--allow-all", "/path/to/src/main.ts"],
      "env": { "MCP_SERVER_COMMAND": "node", "MCP_SERVER_ARGS": "server.js" }
    }
  }
}
```

**Claude Desktop Config - After:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcp-hmr",
      "args": ["node", "server.js"]
    }
  }
}
```

### Added

- **Node.js CLI Commands:** `mcp-hmr` and `mcp-watch` global commands
- **Advanced Setup Features:** `--setup` and `--all` flags for automatic configuration
- **npm Package Distribution:** Standard npm installation and management
- **Enhanced CLI Interface:** Improved help text, error messages, and user experience
- **Automatic Config Detection:** Searches Claude Desktop, Claude Code, and local configs
- **Config Backup System:** Automatic backups when using `--setup` commands

### Changed

- **Runtime Migration:** Switched from Deno to Node.js 18+
- **Build System:** Replaced Deno tasks with npm scripts and TypeScript compiler
- **Testing Framework:** Migrated from Deno's built-in test runner to Jest
- **Package Management:** Uses npm instead of Deno's import maps
- **File Extensions:** TypeScript imports now use `.js` extensions for compiled output
- **CLI Interface:** Completely redesigned command-line interface with new commands
- **Installation Method:** Now distributed via npm registry instead of git clone
- **Permission Model:** Uses standard Node.js permissions instead of Deno's explicit flags

### Removed

- **Deno Support:** Deno-specific implementations and configurations removed
- **Deno Tasks:** All `deno task` commands replaced with `npm run` equivalents
- **Setup Script:** `scripts/setup.ts` removed (replaced by npm's bin field)
- **Deno Configuration:** `deno.jsonc` and `deno.lock` files removed
- **Permission Flags:** No longer need `--allow-env`, `--allow-read`, etc.

### Fixed

- **Cross-platform Compatibility:** Improved Windows support with Node.js
- **Installation Simplicity:** One-command global installation via npm
- **Development Workflow:** Standard Node.js development patterns
- **CLI Usability:** More intuitive command structure and error messages

### Infrastructure

- **Node.js Implementations:** `NodeProcessManager` and `NodeFileSystem`
- **npm Package Structure:** Proper `package.json` with bin fields
- **TypeScript Compilation:** Outputs to `dist/` directory
- **Jest Testing:** Modern testing framework with coverage reports
- **ESLint & Prettier:** Standard Node.js code quality tools

## [0.1.0] - 2024-12-01 (Deno Era)

### Added

- Initial implementation of MCP Hot-Reload proxy
- Configuration-based launcher for MCP servers  
- File change detection with debouncing
- Message buffering during server restarts
- Comprehensive test suite with unit and e2e tests
- Support for environment variable configuration
- Cross-platform compatibility (Windows, macOS, Linux)
- Dependency injection architecture for improved testability
- Platform-agnostic interfaces for ProcessManager and FileSystem
- Mock implementations for comprehensive behavioral testing
- I/O stream abstraction for cross-platform compatibility
- Test helper utilities (test_helper.ts) for DRY test patterns

### Changed

- Refactored MCPProxy to use dependency injection pattern
- Replaced direct Deno API calls with interface abstractions
- Enhanced test infrastructure with behavioral test suite
- Improved process lifecycle management with configurable timing
- Added stream abstraction for stdin/stdout/stderr handling
- Refactored behavioral tests with test_helper.ts pattern (~80% code reduction)
- Eliminated globalThis usage and setTimeout patterns in tests
- Introduced deterministic event-driven test timing

### Fixed

- ReadableStream locked error during test execution
- Process exit termination in test environments
- Test timing issues with mock process management
- Error message alignment in filesystem mocks
- Global variable initialization order in behavioral tests

### Security

- Secure process management with proper signal handling
- Input validation for MCP server configurations

## [0.1.0] - 2024-12-01

### Added

- Initial release of MCP Hot-Reload
- Core hot-reload functionality for MCP servers
- Real-time file watching and server restart
- JSON-RPC message proxying
- Development tooling and testing infrastructure
- MIT license
- Comprehensive documentation

### Technical Details

- Built with Deno for modern JavaScript runtime
- TypeScript support throughout
- GitHub Actions CI/CD pipeline
- Automated testing with coverage reporting
- Deno registry publishing support
