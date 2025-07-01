#!/bin/bash

# MCP Inspector with Hot Module Replacement launcher
# This script can be run from any directory

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory to ensure .env is loaded
cd "$SCRIPT_DIR"

# Check if .env file exists
if [ -f ".env" ]; then
    echo "📋 Loading configuration from .env file..."
    # Export variables from .env file
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found in $SCRIPT_DIR"
    echo "Using command line mode instead..."
fi

# Check if running in command line mode (with arguments)
if [ $# -gt 0 ]; then
    echo "🧪 Running in command line mode with arguments: $@"
    npx @modelcontextprotocol/inspector \
        "$SCRIPT_DIR/src/main.ts" \
        "$@"
else
    # Check if required env vars are set
    if [ -z "$MCP_SERVER_COMMAND" ] || [ -z "$MCP_SERVER_ARGS" ]; then
        echo "❌ Error: MCP_SERVER_COMMAND and MCP_SERVER_ARGS must be set"
        echo ""
        echo "Usage:"
        echo "  1. Create a .env file with MCP_SERVER_COMMAND and MCP_SERVER_ARGS"
        echo "  2. Or pass command and args: $0 <command> <args>"
        echo ""
        echo "Example:"
        echo "  $0 node /path/to/your/mcp-server.js"
        exit 1
    fi

    echo "🔧 Running in environment variable mode"
    echo "📟 Server: $MCP_SERVER_COMMAND $MCP_SERVER_ARGS"

    # Pass all environment variables through to the inspector
    npx @modelcontextprotocol/inspector \
        -e MCP_SERVER_COMMAND="$MCP_SERVER_COMMAND" \
        -e MCP_SERVER_ARGS="$MCP_SERVER_ARGS" \
        -e MCP_WATCH_FILE="$MCP_WATCH_FILE" \
        -e MCP_LOG_LEVEL="$MCP_LOG_LEVEL" \
        "$SCRIPT_DIR/src/main.ts"
fi
