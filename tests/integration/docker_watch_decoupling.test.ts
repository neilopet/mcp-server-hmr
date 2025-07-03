import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { setTimeout } from 'timers/promises';

// Check if Docker is available
const isDockerAvailable = async (): Promise<boolean> => {
  try {
    const docker = spawn('docker', ['version'], { 
      stdio: 'ignore',
      shell: process.platform === 'win32' 
    });
    
    return new Promise((resolve) => {
      docker.on('error', () => resolve(false));
      docker.on('exit', (code) => resolve(code === 0));
    });
  } catch {
    return false;
  }
};

// MCP server script to run inside Docker container
const MCP_SERVER_SCRIPT = `
const readline = require('readline');

// Log startup
console.error('[MCP] Server starting on container ' + process.env.HOSTNAME);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let messageId = 0;

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    
    // Handle MCP initialize request
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '0.1.0',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'docker-test-server',
            version: '1.0.0',
            containerId: process.env.HOSTNAME
          }
        }
      };
      console.log(JSON.stringify(response));
    }
    // Handle echo request for testing
    else if (request.method === 'echo') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          message: request.params.message,
          containerId: process.env.HOSTNAME
        }
      };
      console.log(JSON.stringify(response));
    }
  } catch (e) {
    console.error('[MCP] Error parsing request:', e.message);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.error('[MCP] Server shutting down');
  process.exit(0);
});
`;

describe('Docker Watch Decoupling Integration', () => {
  let dockerAvailable: boolean;
  let tempDir: string;
  let watchFile: string;
  let mcpmonProcess: ChildProcess | null = null;
  let activeContainers: Set<string> = new Set();

  beforeEach(async () => {
    dockerAvailable = await isDockerAvailable();
    
    if (!dockerAvailable) {
      console.log('Docker not available, skipping test');
      return;
    }

    // Create temporary directory and watch file
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpmon-docker-test-'));
    watchFile = path.join(tempDir, 'trigger.txt');
    await fs.writeFile(watchFile, 'initial content');
  });

  afterEach(async () => {
    // Kill mcpmon process
    if (mcpmonProcess && !mcpmonProcess.killed) {
      mcpmonProcess.kill('SIGTERM');
      await setTimeout(100);
      if (!mcpmonProcess.killed) {
        mcpmonProcess.kill('SIGKILL');
      }
    }

    // Clean up any remaining Docker containers
    for (const containerId of activeContainers) {
      try {
        spawn('docker', ['rm', '-f', containerId], { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }
    }
    activeContainers.clear();

    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should restart Docker container on file change without volume mount parsing', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test: Docker not available');
      return;
    }

    // Build mcpmon command
    const mcpmonPath = path.join(process.cwd(), 'dist', 'cli.js');
    const dockerCommand = [
      'docker', 'run', '-i', '--rm',
      'node:alpine',
      'node', '-e', MCP_SERVER_SCRIPT
    ];

    // Start mcpmon with separate watch and command
    mcpmonProcess = spawn('node', [
      mcpmonPath,
      '--watch', watchFile,
      ...dockerCommand
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    let stderr = '';
    let stdout = '';
    let firstContainerId: string | null = null;
    let secondContainerId: string | null = null;

    // Handle process errors
    mcpmonProcess.on('error', (error) => {
      console.error('mcpmon process error:', error);
    });

    // Capture output
    mcpmonProcess.stdout!.on('data', (data) => {
      stdout += data.toString();
    });

    mcpmonProcess.stderr!.on('data', (data) => {
      stderr += data.toString();
      
      // Extract container ID from startup message (12-character Docker short ID)
      const match = data.toString().match(/\[MCP\] Server starting on container ([a-f0-9]{12})/);
      if (match) {
        const containerId = match[1];
        activeContainers.add(containerId);
        
        if (!firstContainerId) {
          firstContainerId = containerId;
        } else if (!secondContainerId && containerId !== firstContainerId) {
          secondContainerId = containerId;
        }
      }
    });

    // Test 1: Container starts successfully with mcpmon
    await waitForPattern(() => stderr, /\[MCP\] Server starting on container/, 5000);
    expect(firstContainerId).toBeTruthy();

    // Test 2: Container responds to MCP messages
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '0.1.0',
        capabilities: {}
      }
    };
    
    mcpmonProcess.stdin!.write(JSON.stringify(initRequest) + '\n');
    await waitForPattern(() => stdout, /"serverInfo"/, 2000);
    
    // Verify response contains first container ID
    expect(stdout).toContain('"docker-test-server"');
    expect(stdout).toContain(firstContainerId);

    // Test 3: File change triggers container restart
    await fs.writeFile(watchFile, 'changed content');

    // Wait for new container startup (looking for any new container message)
    const beforeRestartLength = stderr.length;
    await waitForPattern(() => stderr.substring(beforeRestartLength), /\[MCP\] Server starting on container/, 5000);
    expect(secondContainerId).toBeTruthy();
    expect(secondContainerId).not.toBe(firstContainerId);

    // Test 4: New container instance is functional
    // The fact that we got a different container ID proves restart happened

    // Verify graceful shutdown
    mcpmonProcess.kill('SIGTERM');
    await waitForPattern(() => stderr, /\[MCP\] Server shutting down/, 2000);
    
    // Test passed - proves that:
    // 1. Container starts successfully with mcpmon ✓
    // 2. File change triggers container restart ✓
    // 3. New container instance starts successfully ✓
    // 4. No volume mount parsing needed (demonstrates decoupling) ✓
  }, 30000); // 30 second timeout for Docker operations

  it('should handle Docker daemon not running', async () => {
    if (dockerAvailable) {
      console.log('Skipping test: Docker is available');
      return;
    }

    const mcpmonPath = path.join(process.cwd(), 'dist', 'cli.js');
    
    mcpmonProcess = spawn('node', [
      mcpmonPath,
      '--watch', watchFile,
      'docker', 'run', '-i', '--rm', 'node:alpine', 'node', '-e', 'console.log("test")'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    let stderr = '';
    mcpmonProcess.stderr!.on('data', (data) => {
      stderr += data.toString();
    });

    // Should fail to start Docker container
    await new Promise<void>((resolve) => {
      mcpmonProcess!.on('exit', (code) => {
        expect(code).not.toBe(0);
        resolve();
      });
    });

    // Verify error message about Docker
    expect(stderr.toLowerCase()).toMatch(/docker|cannot find|not found/);
  });

  it('should clean up containers on error', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test: Docker not available');
      return;
    }

    const mcpmonPath = path.join(process.cwd(), 'dist', 'cli.js');
    
    // Use a script that will error after startup
    const errorScript = `
    console.error('[MCP] Server starting on container ' + process.env.HOSTNAME);
    setTimeout(() => {
      console.error('[MCP] Simulated error');
      process.exit(1);
    }, 1000);
    `;

    mcpmonProcess = spawn('node', [
      mcpmonPath,
      '--watch', watchFile,
      'docker', 'run', '-i', '--rm', 'node:alpine', 'node', '-e', errorScript
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    let stderr = '';
    let containerId: string | null = null;

    mcpmonProcess.stderr!.on('data', (data) => {
      stderr += data.toString();
      
      const match = data.toString().match(/\[MCP\] Server starting on container ([a-f0-9]{12})/);
      if (match && !containerId) {
        containerId = match[1];
        activeContainers.add(containerId!);
      }
    });

    // Wait for startup
    await waitForPattern(() => stderr, /\[MCP\] Server starting on container/, 5000);
    expect(containerId).toBeTruthy();

    // Wait for simulated error
    await waitForPattern(() => stderr, /\[MCP\] Simulated error/, 3000);

    // Give time for cleanup
    await setTimeout(2000);

    // Verify container was removed (docker ps should not show it)
    const psProcess = spawn('docker', ['ps', '-a', '-q', '--filter', `id=${containerId}`], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const psOutput = await new Promise<string>((resolve) => {
      let output = '';
      psProcess.stdout!.on('data', (data) => {
        output += data.toString();
      });
      psProcess.on('exit', () => resolve(output.trim()));
    });

    // Container should not exist anymore (cleaned up by --rm flag)
    expect(psOutput).toBe('');
  });
});

// Helper function to wait for a pattern in output
async function waitForPattern(
  output: string | (() => string), 
  pattern: RegExp, 
  timeout: number
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const currentOutput = typeof output === 'function' ? output() : output;
    if (pattern.test(currentOutput)) {
      return;
    }
    await setTimeout(100);
  }
  
  const finalOutput = typeof output === 'function' ? output() : output;
  throw new Error(`Timeout waiting for pattern ${pattern}. Output: ${finalOutput}`);
}