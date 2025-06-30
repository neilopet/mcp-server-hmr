# Test Suite

This directory contains tests for the MCP Server HMR project.

## Running Tests

```bash
# Run all tests (includes clean and build)
deno task test

# Quick test during development (no clean/build)
deno task test:quick

# Watch mode for TDD
deno task test:watch

# Generate coverage report
deno task test:coverage
```

## Test Structure

### `simple_test.ts`
Basic smoke tests that verify:
- Environment access works
- File system permissions are correct
- Process spawning works
- Project structure is intact
- Configuration files are valid

### `core_functionality_test.ts`
Tests core features that the MCP proxy relies on:
- Debounce functionality (for file change buffering)
- File watching API availability
- Process management capabilities

## Test Philosophy

These tests focus on:
1. **Environment validation** - Ensuring the runtime has required permissions
2. **Core API availability** - Verifying Deno APIs we depend on work
3. **Project integrity** - Checking configuration and structure

## Why Simple Tests?

The original comprehensive test suite was overly complex and had issues with:
- Race conditions in file watching
- Process cleanup problems
- Resource leaks
- Interference with the main application's stdin handling

Instead, we focus on testing:
- The building blocks our application uses
- Project configuration and structure
- Basic functionality verification

For integration testing, developers should:
1. Use the provided examples in `examples/quickstart.md`
2. Test with real MCP servers in development
3. Use the detailed logging to verify behavior

## Adding Tests

When adding new tests:
1. Keep them simple and focused
2. Clean up resources (files, processes)
3. Avoid tests that interfere with stdin/stdout
4. Use `{ sanitizeResources: false, sanitizeOps: false }` if needed for complex tests
5. Test the APIs and building blocks, not the full integration

## Test Permissions

Tests require these permissions:
- `--allow-env` - Read environment variables
- `--allow-read` - Read project files
- `--allow-write` - Create temporary test files
- `--allow-run` - Spawn test processes