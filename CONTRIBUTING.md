# Contributing to MCP Hot-Reload

👍🎉 First off, thanks for taking the time to contribute! 🎉👍

We welcome contributions from everyone, regardless of experience level. This guide helps you get started with MCP Hot-Reload development.

## Ways to Contribute

### 🐛 Found a Bug?

- Check if it's already reported in [Issues](https://github.com/neilopet/claude-live-reload/issues)
- If not, [create a new issue](https://github.com/neilopet/claude-live-reload/issues/new) with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Your environment (OS, Deno version)
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

- Deno 1.40+ ([install guide](https://deno.land/manual/getting_started/installation))
- Git
- A test MCP server for development (we provide examples)

### Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/claude-live-reload.git
cd claude-live-reload

# 2. Run tests to verify setup
deno task test

# 3. Start development
deno task dev
```

### Project Structure

```
src/
├── main.ts           # Main hot-reload proxy
├── config_launcher.ts # Config-based launcher
└── mod.ts            # Module exports

tests/
├── unit/             # Unit tests
├── integration/      # Integration tests
└── fixtures/         # Test MCP servers

examples/             # Usage examples
docs/                 # Documentation
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

We use Deno's built-in tooling for code quality:

```bash
# Format your code
deno fmt

# Lint your code
deno lint

# Type check
deno check src/mod.ts src/main.ts

# Run all quality checks
deno task prebuild
```

**Code Style Guidelines:**

- Use TypeScript for all code
- Write descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and testable
- Follow Deno conventions

### 3. Testing Requirements

All changes must include appropriate tests:

```bash
# Run all tests
deno task test

# Run specific test categories
deno task test:unit        # Unit tests only
deno task test:integration # Integration tests only

# Run tests with coverage
deno task test:coverage
```

**Testing Guidelines:**

- Add tests for new features
- Update tests when modifying behavior
- Test edge cases and error conditions
- Use descriptive test names
- Include e2e tests for user-facing features

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
3. Run: `deno task start` to test manually

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

- [ ] Tests pass (`deno task test`)
- [ ] Code is formatted (`deno fmt`)
- [ ] Code is linted (`deno lint`)
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
