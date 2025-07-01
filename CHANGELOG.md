# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of MCP Hot-Reload proxy
- Configuration-based launcher for MCP servers
- File change detection with debouncing
- Message buffering during server restarts
- Comprehensive test suite with unit and e2e tests
- Support for environment variable configuration
- Cross-platform compatibility (Windows, macOS, Linux)

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
