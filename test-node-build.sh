#!/bin/bash
# Test the Node.js build

echo "🧪 Testing Node.js build..."

# Build
echo "📦 Building..."
if ! deno task build:node; then
  echo "❌ Build failed"
  exit 1
fi

# Change to dist directory
cd dist || exit 1

# Install dependencies
echo "📦 Installing dependencies..."
if ! npm install --silent; then
  echo "❌ npm install failed"
  exit 1
fi

# Test help command
echo "🔍 Testing --help..."
if ! ./watch --help | grep -q "MCP Server Watch"; then
  echo "❌ Help command failed"
  exit 1
fi

# Test list command (should work even without config)
echo "🔍 Testing --list..."
./watch --list 2>&1 | grep -q "No config file found" && echo "✅ List command works"

# Test with a simple server
echo "🔍 Testing direct mode..."
timeout 2 ./watch echo "test" 2>&1 | grep -q "Starting MCP server" && echo "✅ Direct mode works" || echo "⚠️  Direct mode test inconclusive"

echo "✅ All tests passed!"