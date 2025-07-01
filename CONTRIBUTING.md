# Contributing to MCP Hot-Reload

👍🎉 First off, thanks for taking the time to contribute! 🎉👍

We welcome contributions from everyone, regardless of experience level. This guide helps you get started with MCP Hot-Reload development.

## Ways to Contribute

### 🐛 Found a Bug?

- Check if it's already reported in [Issues](https://github.com/neilopet/claude-live-reload/issues)
- If not, [create a new issue](https://github.com/neilopet/claude-live-reload/issues/new) with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Your environment (OS, Node.js version)
  - MCP server configuration (if applicable)

### 💡 Have an Idea?

- Check existing issues for similar requests
- Open a feature request with:
  - Clear description of the problem it solves
  - Proposed solution
  - Use cases and examples

### 📝 Documentation Improvements

- Fix typos, improve clarity, add examples
- Documentation lives in `/docs` and README.md
- All contributions to docs are welcome!

## Development Setup

### Prerequisites

- Node.js 18+ ([install guide](https://nodejs.org/))
- npm (comes with Node.js)
- Git
- A test MCP server for development (we provide examples)

### Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/claude-live-reload.git
cd claude-live-reload

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Run tests to verify setup
npm test

# 5. Start development
npm run dev
```

### Project Structure

```
src/
├── cli.ts             # Main CLI entry point
├── proxy.ts           # MCPProxy core implementation
├── config_launcher.ts # Config-based launcher
├── interfaces.ts      # Platform-agnostic interfaces
├── node/              # Node.js-specific implementations
│   ├── NodeProcessManager.ts
│   └── NodeFileSystem.ts
└── index.ts           # Module exports

dist/                  # Compiled JavaScript output

tests/
├── behavior/          # Platform-agnostic behavioral tests
│   ├── test_helper.ts # Shared test utilities
│   └── *.test.ts      # Behavioral test files
├── mocks/             # Mock implementations
│   ├── MockProcessManager.ts
│   └── MockFileSystem.ts
├── unit/              # Unit tests
├── integration/       # Integration tests
└── fixtures/          # Test MCP servers

examples/              # Usage examples
docs/                  # Documentation
```

## Making Changes

### 1. Create a Branch

```bash
# Create a descriptive branch name
git checkout -b feature/add-config-validation
git checkout -b fix/debouncing-issue
git checkout -b docs/update-examples
```

### 2. Code Standards

We use standard Node.js tooling for code quality:

```bash
# Format your code
npm run format

# Lint your code
npm run lint

# Type check
npm run typecheck

# Build the project
npm run build

# Run all quality checks
npm run build && npm run lint
```

**Code Style Guidelines:**

- Use TypeScript for all code
- Write descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and testable
- Follow Node.js and TypeScript conventions

### 3. Testing Requirements

All changes must include appropriate tests:

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only

# Run tests with coverage
npm run test:coverage
```

**Testing Guidelines:**

- Add tests for new features
- Update tests when modifying behavior
- Test edge cases and error conditions
- Use descriptive test names
- Include e2e tests for user-facing features

**Behavioral Test Pattern:**

For platform-agnostic behavioral tests, use the test helper pattern:

```typescript
import { setupProxyTest, simulateRestart } from "./test_helper.js";
import { describe, it, expect } from '@jest/globals';

describe('Test Suite', () => {
  it('Feature - specific behavior description', async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100, // Configure test timing
    });

    try {
      await proxy.start();
      await simulateRestart(procManager, fs);

      // Test assertions
      expect(procManager.getSpawnCallCount()).toBe(2);
    } finally {
      await teardown(); // Always clean up
    }
  });
});
```

This pattern provides:

- Consistent test setup with mock implementations
- Deterministic timing (no setTimeout)
- Proper resource cleanup
- ~80% less boilerplate code

### 4. Commit Guidelines

We follow [Conventional Commits](https://conventionalcommits.org/):

```bash
# Examples
git commit -m "feat: add configuration validation"
git commit -m "fix: resolve debouncing race condition"
git commit -m "docs: update installation guide"
git commit -m "test: add e2e tests for config launcher"
```

**Commit Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or modifications
- `refactor`: Code refactoring
- `style`: Formatting changes
- `ci`: CI/CD changes

## Development Tips

### Testing with Real MCP Servers

1. Use the test fixtures in `tests/fixtures/`
2. Create a `.env` file for local testing:
   ```bash
   MCP_SERVER_COMMAND=node
   MCP_SERVER_ARGS=tests/fixtures/mcp_server_v1.js
   MCP_WATCH_FILE=tests/fixtures/mcp_server_v1.js
   ```
3. Run: `npm start` to test manually

### Debugging

- Use `console.error()` for debug output (goes to stderr)
- Enable verbose logging in tests
- Check the `proxy.log` file for detailed output

### Performance Considerations

- Hot-reload should be fast (< 2 seconds)
- Minimize memory usage during restarts
- Test with large MCP servers

## Pull Request Process

### 1. Before Submitting

- [ ] Tests pass (`npm test`)
- [ ] Code is formatted (`npm run format`)
- [ ] Code is linted (`npm run lint`)
- [ ] Code compiles (`npm run build`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated (if applicable)

### 2. Pull Request Description

Include:

- What changes you made and why
- How to test the changes
- Screenshots/examples for UI changes
- Breaking changes (if any)

### 3. Review Process

- Maintainers will review within 2-3 business days
- Address feedback promptly
- Keep the PR focused and atomic
- Rebase on main if needed

## Release Process

Releases follow semantic versioning:

- `patch`: Bug fixes (0.1.0 → 0.1.1)
- `minor`: New features (0.1.0 → 0.2.0)
- `major`: Breaking changes (0.1.0 → 1.0.0)

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Help

Need help? Here's how to get support:

1. **Check Documentation**: Start with README.md and `/docs`
2. **Search Issues**: Someone might have asked the same question
3. **Create an Issue**: For bugs, feature requests, or questions
4. **Discussions**: For general questions about MCP or hot-reload concepts

## Recognition

Contributors are recognized in:

- Release notes
- README.md contributors section
- Git history

Thank you for contributing to MCP Hot-Reload! 🚀
