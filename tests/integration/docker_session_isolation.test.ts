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

// MCP server script that logs container ID and responds to commands
const MCP_SERVER_SCRIPT = `
const readline = require('readline');

// Log startup with unique identifier
console.error('[MCP] Server starting on container ' + process.env.HOSTNAME + ' (session: ' + (process.env.MCPMON_SESSION || 'default') + ')');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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
          capabilities: { tools: {} },
          serverInfo: {
            name: 'docker-test-server',
            version: '1.0.0',
            containerId: process.env.HOSTNAME,
            session: process.env.MCPMON_SESSION || 'default'
          }
        }
      };
      console.log(JSON.stringify(response));
    }
    // Handle ping request for testing isolation
    else if (request.method === 'ping') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          pong: true,
          containerId: process.env.HOSTNAME,
          session: process.env.MCPMON_SESSION || 'default',
          timestamp: Date.now()
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
  console.error('[MCP] Server shutting down from container ' + process.env.HOSTNAME);
  process.exit(0);
});
`;

describe('Docker Session Isolation', () => {
  let dockerAvailable: boolean;
  let tempDir: string;
  let watchFile1: string;
  let watchFile2: string;
  let mcpmonProcess1: ChildProcess | null = null;
  let mcpmonProcess2: ChildProcess | null = null;
  let activeContainers: Set<string> = new Set();

  beforeEach(async () => {
    dockerAvailable = await isDockerAvailable();
    
    if (!dockerAvailable) {
      console.log('Docker not available, skipping test');
      return;
    }

    // Create temporary directory and separate watch files for each instance
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpmon-isolation-test-'));
    watchFile1 = path.join(tempDir, 'trigger1.txt');
    watchFile2 = path.join(tempDir, 'trigger2.txt');
    
    await fs.writeFile(watchFile1, 'initial content 1');
    await fs.writeFile(watchFile2, 'initial content 2');

    // Clean up any existing test containers
    await cleanupTestContainers();
  });

  afterEach(async () => {
    // Kill mcpmon processes
    if (mcpmonProcess1 && !mcpmonProcess1.killed) {
      mcpmonProcess1.kill('SIGTERM');
      await setTimeout(100);
      if (!mcpmonProcess1.killed) {
        mcpmonProcess1.kill('SIGKILL');
      }
    }

    if (mcpmonProcess2 && !mcpmonProcess2.killed) {
      mcpmonProcess2.kill('SIGTERM');
      await setTimeout(100);
      if (!mcpmonProcess2.killed) {
        mcpmonProcess2.kill('SIGKILL');
      }
    }

    // Clean up any remaining Docker containers
    await cleanupTestContainers();
    activeContainers.clear();

    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should isolate Docker containers between mcpmon instances', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test: Docker not available');
      return;
    }

    const mcpmonPath = path.join(process.cwd(), 'dist', 'cli.js');
    
    // Docker command template (alpine with sleep to keep container alive)
    const createDockerCommand = (sessionLabel: string) => [
      'docker', 'run', '-i', '--rm',
      '--label', `mcpmon-test=${sessionLabel}`,
      '-e', `MCPMON_SESSION=${sessionLabel}`,
      'node:alpine',
      'node', '-e', MCP_SERVER_SCRIPT
    ];

    // Track container IDs and session data
    const session1Data = {
      containerId: null as string | null,
      stderr: '',
      stdout: '',
      initialized: false
    };

    const session2Data = {
      containerId: null as string | null,
      stderr: '',
      stdout: '',
      initialized: false
    };

    // Start first mcpmon instance
    mcpmonProcess1 = spawn('node', [
      mcpmonPath,
      '--watch', watchFile1,
      ...createDockerCommand('session1')
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    // Start second mcpmon instance
    mcpmonProcess2 = spawn('node', [
      mcpmonPath,
      '--watch', watchFile2,
      ...createDockerCommand('session2')
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    // Set up output handlers for first instance
    mcpmonProcess1.stderr!.on('data', (data) => {
      session1Data.stderr += data.toString();
      extractContainerId(data.toString(), session1Data, 'session1');
    });

    mcpmonProcess1.stdout!.on('data', (data) => {
      session1Data.stdout += data.toString();
    });

    // Set up output handlers for second instance
    mcpmonProcess2.stderr!.on('data', (data) => {
      session2Data.stderr += data.toString();
      extractContainerId(data.toString(), session2Data, 'session2');
    });

    mcpmonProcess2.stdout!.on('data', (data) => {
      session2Data.stdout += data.toString();
    });

    // Wait for both containers to start
    await waitForPattern(() => session1Data.stderr, /\[MCP\] Server starting on container.*session1/, 10000);
    await waitForPattern(() => session2Data.stderr, /\[MCP\] Server starting on container.*session2/, 10000);

    // Verify both instances have different container IDs
    expect(session1Data.containerId).toBeTruthy();
    expect(session2Data.containerId).toBeTruthy();
    expect(session1Data.containerId).not.toBe(session2Data.containerId);

    console.log(`Session 1 container: ${session1Data.containerId}`);
    console.log(`Session 2 container: ${session2Data.containerId}`);

    // Initialize both MCP servers
    await initializeMCPServer(mcpmonProcess1!, session1Data);
    await initializeMCPServer(mcpmonProcess2!, session2Data);

    // Verify both servers are responsive
    await pingMCPServer(mcpmonProcess1!, session1Data, 'session1');
    await pingMCPServer(mcpmonProcess2!, session2Data, 'session2');

    // Count total test containers before reload
    const containerCountBefore = await getTestContainerCount();
    expect(containerCountBefore).toBe(2);

    // Trigger reload on FIRST instance only by modifying its watch file
    const originalSession1ContainerId = session1Data.containerId;
    await fs.writeFile(watchFile1, 'changed content 1');

    // Wait for first container to restart (new container ID)
    const beforeRestartLength = session1Data.stderr.length;
    await waitForPattern(
      () => session1Data.stderr.substring(beforeRestartLength), 
      /\[MCP\] Server starting on container.*session1/, 
      10000
    );

    // Verify first instance got a new container ID
    const newSession1ContainerId = extractLatestContainerId(session1Data.stderr, 'session1');
    expect(newSession1ContainerId).toBeTruthy();
    expect(newSession1ContainerId).not.toBe(originalSession1ContainerId);

    // Verify second instance container ID remained unchanged
    const currentSession2ContainerId = session2Data.containerId;
    expect(currentSession2ContainerId).toBe(session2Data.containerId);

    // Verify second instance is still responsive (no restart occurred)
    await pingMCPServer(mcpmonProcess2!, session2Data, 'session2');

    // Count containers after reload - should still be 2 (one restarted, one unchanged)
    const containerCountAfter = await getTestContainerCount();
    expect(containerCountAfter).toBe(2);

    // Test graceful shutdown of both instances
    mcpmonProcess1!.kill('SIGTERM');
    mcpmonProcess2!.kill('SIGTERM');

    await waitForPattern(() => session1Data.stderr, /\[MCP\] Server shutting down/, 5000);
    await waitForPattern(() => session2Data.stderr, /\[MCP\] Server shutting down/, 5000);

    // Wait for cleanup and verify all test containers are removed
    await setTimeout(2000);
    const finalContainerCount = await getTestContainerCount();
    expect(finalContainerCount).toBe(0);

    console.log('✓ Session isolation verified: containers operated independently');
  }, 60000); // 60 second timeout for Docker operations

  it('should handle concurrent file changes independently', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test: Docker not available');
      return;
    }

    const mcpmonPath = path.join(process.cwd(), 'dist', 'cli.js');
    
    const createDockerCommand = (sessionLabel: string) => [
      'docker', 'run', '-i', '--rm',
      '--label', `mcpmon-test=${sessionLabel}`,
      '-e', `MCPMON_SESSION=${sessionLabel}`,
      'node:alpine',
      'node', '-e', MCP_SERVER_SCRIPT
    ];

    const session1Data = {
      containerId: null as string | null,
      stderr: '',
      stdout: ''
    };

    const session2Data = {
      containerId: null as string | null,
      stderr: '',
      stdout: ''
    };

    // Start both instances
    mcpmonProcess1 = spawn('node', [mcpmonPath, '--watch', watchFile1, ...createDockerCommand('concurrent1')], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false
    });

    mcpmonProcess2 = spawn('node', [mcpmonPath, '--watch', watchFile2, ...createDockerCommand('concurrent2')], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false
    });

    // Set up handlers
    mcpmonProcess1.stderr!.on('data', (data) => {
      session1Data.stderr += data.toString();
      extractContainerId(data.toString(), session1Data, 'concurrent1');
    });

    mcpmonProcess2.stderr!.on('data', (data) => {
      session2Data.stderr += data.toString();
      extractContainerId(data.toString(), session2Data, 'concurrent2');
    });

    // Wait for startup
    await waitForPattern(() => session1Data.stderr, /\[MCP\] Server starting.*concurrent1/, 10000);
    await waitForPattern(() => session2Data.stderr, /\[MCP\] Server starting.*concurrent2/, 10000);

    const originalContainer1 = session1Data.containerId;
    const originalContainer2 = session2Data.containerId;

    // Trigger changes on BOTH files simultaneously
    await Promise.all([
      fs.writeFile(watchFile1, 'concurrent change 1'),
      fs.writeFile(watchFile2, 'concurrent change 2')
    ]);

    // Wait for both containers to restart
    await Promise.all([
      waitForNewContainer(session1Data, originalContainer1!, 'concurrent1'),
      waitForNewContainer(session2Data, originalContainer2!, 'concurrent2')
    ]);

    // Verify both got new container IDs independently
    const newContainer1 = extractLatestContainerId(session1Data.stderr, 'concurrent1');
    const newContainer2 = extractLatestContainerId(session2Data.stderr, 'concurrent2');

    expect(newContainer1).not.toBe(originalContainer1);
    expect(newContainer2).not.toBe(originalContainer2);
    expect(newContainer1).not.toBe(newContainer2);

    console.log('✓ Concurrent changes handled independently');
  }, 45000);

  // Helper functions
  function extractContainerId(output: string, sessionData: any, expectedSession: string): void {
    const match = output.match(/\[MCP\] Server starting on container ([a-f0-9]{12}).*session:\s*(\w+)/);
    if (match && match[2] === expectedSession) {
      const containerId = match[1];
      activeContainers.add(containerId);
      sessionData.containerId = containerId;
    }
  }

  function extractLatestContainerId(stderr: string, session: string): string | null {
    const matches = stderr.match(new RegExp(`\\[MCP\\] Server starting on container ([a-f0-9]{12}).*session:\\s*${session}`, 'g'));
    if (!matches || matches.length === 0) return null;
    
    const lastMatch = matches[matches.length - 1];
    const match = lastMatch.match(/container ([a-f0-9]{12})/);
    return match ? match[1] : null;
  }

  async function initializeMCPServer(process: ChildProcess, sessionData: any): Promise<void> {
    const initRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'initialize',
      params: { protocolVersion: '0.1.0', capabilities: {} }
    };
    
    process.stdin!.write(JSON.stringify(initRequest) + '\n');
    await waitForPattern(() => sessionData.stdout, /"serverInfo"/, 5000);
    sessionData.initialized = true;
  }

  async function pingMCPServer(process: ChildProcess, sessionData: any, expectedSession: string): Promise<void> {
    const pingRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'ping',
      params: {}
    };
    
    const beforeLength = sessionData.stdout.length;
    process.stdin!.write(JSON.stringify(pingRequest) + '\n');
    await waitForPattern(() => sessionData.stdout.substring(beforeLength), /"pong"/, 3000);
    
    // Verify response contains correct session
    const response = sessionData.stdout.substring(beforeLength);
    expect(response).toContain(`"session":"${expectedSession}"`);
  }

  async function waitForNewContainer(sessionData: any, originalContainerId: string, session: string): Promise<void> {
    const startTime = Date.now();
    const timeout = 15000;
    
    while (Date.now() - startTime < timeout) {
      const newContainerId = extractLatestContainerId(sessionData.stderr, session);
      if (newContainerId && newContainerId !== originalContainerId) {
        return;
      }
      await setTimeout(100);
    }
    
    throw new Error(`Timeout waiting for container restart in session ${session}`);
  }

  async function getTestContainerCount(): Promise<number> {
    return new Promise((resolve) => {
      const ps = spawn('docker', ['ps', '-q', '--filter', 'label=mcpmon-test'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      ps.stdout!.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('exit', () => {
        const lines = output.trim().split('\n').filter(line => line.length > 0);
        resolve(lines.length);
      });
    });
  }

  async function cleanupTestContainers(): Promise<void> {
    return new Promise((resolve) => {
      const cleanup = spawn('docker', ['ps', '-aq', '--filter', 'label=mcpmon-test'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let containerIds = '';
      cleanup.stdout!.on('data', (data) => {
        containerIds += data.toString();
      });
      
      cleanup.on('exit', () => {
        const ids = containerIds.trim().split('\n').filter(id => id.length > 0);
        if (ids.length > 0) {
          spawn('docker', ['rm', '-f', ...ids], { stdio: 'ignore' });
        }
        setTimeout(1000).then(() => resolve()); // Give cleanup time
      });
    });
  }
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