#!/usr/bin/env python3

"""
Python MCP Server Example

This demonstrates hot-reload functionality with a Python MCP server.
Try modifying the TOOLS list or tool implementations to see hot-reload in action!
"""

import json
import sys
import signal
from typing import Dict, Any, List

# Server configuration
SERVER_INFO = {
    "name": "python-example-server",
    "version": "1.0.0"
}

# Define available tools - modify this list to test hot-reload!
TOOLS = [
    {
        "name": "calculate",
        "description": "Perform basic mathematical calculations - try changing this description!",
        "inputSchema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Mathematical expression to evaluate (e.g., '2 + 2')"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "reverse_string",
        "description": "Reverse a given string",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to reverse"
                }
            },
            "required": ["text"]
        }
    }
]

def log(message: str) -> None:
    """Log message to stderr"""
    print(f"[Python Server] {message}", file=sys.stderr)

def send_response(response: Dict[str, Any]) -> None:
    """Send JSON response to stdout"""
    print(json.dumps(response), flush=True)

def handle_initialize(message: Dict[str, Any]) -> None:
    """Handle initialize request"""
    response = {
        "jsonrpc": "2.0",
        "id": message["id"],
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": SERVER_INFO
        }
    }
    send_response(response)

def handle_tools_list(message: Dict[str, Any]) -> None:
    """Handle tools/list request"""
    response = {
        "jsonrpc": "2.0",
        "id": message["id"],
        "result": {
            "tools": TOOLS
        }
    }
    send_response(response)

def handle_tool_call(message: Dict[str, Any]) -> None:
    """Handle tools/call request"""
    tool_name = message.get("params", {}).get("name")
    arguments = message.get("params", {}).get("arguments", {})
    
    if tool_name == "calculate":
        try:
            expression = arguments.get("expression", "")
            # Simple evaluation - in real apps, use a proper math parser!
            result = eval(expression)
            response = {
                "jsonrpc": "2.0",
                "id": message["id"],
                "result": {
                    "content": [{
                        "type": "text",
                        "text": f"Result: {expression} = {result}"
                    }]
                }
            }
        except Exception as e:
            response = {
                "jsonrpc": "2.0",
                "id": message["id"],
                "error": {
                    "code": -32000,
                    "message": f"Calculation error: {str(e)}"
                }
            }
    
    elif tool_name == "reverse_string":
        text = arguments.get("text", "")
        reversed_text = text[::-1]
        response = {
            "jsonrpc": "2.0",
            "id": message["id"],
            "result": {
                "content": [{
                    "type": "text",
                    "text": f"Original: '{text}' -> Reversed: '{reversed_text}'"
                }]
            }
        }
    
    else:
        response = {
            "jsonrpc": "2.0",
            "id": message["id"],
            "error": {
                "code": -32601,
                "message": f"Unknown tool: {tool_name}"
            }
        }
    
    send_response(response)

def handle_message(line: str) -> None:
    """Process incoming message"""
    try:
        message = json.loads(line.strip())
        
        if message.get("method") == "initialize":
            handle_initialize(message)
        elif message.get("method") == "tools/list":
            handle_tools_list(message)
        elif message.get("method") == "tools/call":
            handle_tool_call(message)
        else:
            # Unknown method
            response = {
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {message.get('method')}"
                }
            }
            send_response(response)
            
    except json.JSONDecodeError as e:
        log(f"JSON parse error: {e}")
    except Exception as e:
        log(f"Error handling message: {e}")

def shutdown_handler(signum, frame):
    """Handle shutdown signals"""
    log(f"Received signal {signum}, shutting down...")
    sys.exit(0)

def main():
    """Main server loop"""
    log("Starting up...")
    
    # Set up signal handlers
    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)
    
    log("Ready to receive requests!")
    
    # Main message loop
    try:
        for line in sys.stdin:
            if line.strip():
                handle_message(line)
    except KeyboardInterrupt:
        log("Keyboard interrupt received")
    except Exception as e:
        log(f"Unexpected error: {e}")
    finally:
        log("Shutting down...")

if __name__ == "__main__":
    main()