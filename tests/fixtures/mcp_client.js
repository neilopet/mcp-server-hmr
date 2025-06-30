#!/usr/bin/env node

/**
 * Simple MCP Client - Built from @modelcontextprotocol/typescript-sdk
 * For testing MCP Server HMR functionality
 */

const { spawn } = require('child_process');
const readline = require('readline');

class MCPClient {
  constructor(serverCommand, serverArgs) {
    this.serverCommand = serverCommand;
    this.serverArgs = serverArgs;
    this.serverProcess = null;
    this.currentId = 1;
    this.pendingRequests = new Map();
    this.isConnected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(this.serverCommand, this.serverArgs, {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      this.serverProcess.on('error', (error) => {
        reject(error);
      });

      this.serverProcess.on('spawn', () => {
        this.isConnected = true;
        this.setupMessageHandling();
        resolve();
      });

      this.serverProcess.on('exit', (code) => {
        this.isConnected = false;
        console.error(`[Client] Server process exited with code: ${code}`);
      });
    });
  }

  setupMessageHandling() {
    const rl = readline.createInterface({
      input: this.serverProcess.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      try {
        const message = JSON.parse(line.trim());
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);
          resolve(message);
        }
      } catch (error) {
        console.error(`[Client] Failed to parse response: ${error.message}`);
      }
    });
  }

  async sendRequest(method, params = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    const id = this.currentId++;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const requestStr = JSON.stringify(request) + '\n';
      this.serverProcess.stdin.write(requestStr);

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 5000);
    });
  }

  async initialize() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    });

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    return response.result;
  }

  async listTools() {
    const response = await this.sendRequest('tools/list');
    
    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }

    return response.result.tools;
  }

  async callTool(name, arguments_) {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: arguments_ || {}
    });

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  async disconnect() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.isConnected = false;
    }
  }
}

// Export for use in tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MCPClient;
}

// CLI usage
if (require.main === module) {
  async function main() {
    const serverCommand = process.argv[2];
    const serverArgs = process.argv.slice(3);

    if (!serverCommand) {
      console.error('Usage: node mcp_client.js <server_command> [args...]');
      process.exit(1);
    }

    const client = new MCPClient(serverCommand, serverArgs);

    try {
      console.log('[Client] Connecting to server...');
      await client.connect();

      console.log('[Client] Initializing...');
      const initResult = await client.initialize();
      console.log('[Client] Initialize result:', JSON.stringify(initResult, null, 2));

      console.log('[Client] Listing tools...');
      const tools = await client.listTools();
      console.log('[Client] Available tools:', JSON.stringify(tools, null, 2));

      if (tools.length > 0) {
        const toolName = tools[0].name;
        console.log(`[Client] Calling tool: ${toolName}`);
        const result = await client.callTool(toolName, { input: "test" });
        console.log('[Client] Tool result:', JSON.stringify(result, null, 2));
      }

    } catch (error) {
      console.error('[Client] Error:', error.message);
    } finally {
      await client.disconnect();
    }
  }

  main().catch(console.error);
}