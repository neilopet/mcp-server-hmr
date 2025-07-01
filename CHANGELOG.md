# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-07-01

### 🚨 BREAKING CHANGES

**Major Migration: Deno → Node.js**

This release migrates the project from Deno to Node.js as the canonical implementation. This is a **major breaking change** that affects installation, usage, and development workflows.

#### Migration Guide for Existing Users

**Before (Deno):**
```bash
# Installation
git clone https://github.com/neilopet/mcp-server-hmr
cd mcp-server-hmr
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
   git clone https://github.com/neilopet/mcp-server-hmr
   cd mcp-server-hmr
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
