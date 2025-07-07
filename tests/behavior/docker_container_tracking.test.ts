import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPProxy } from '../../src/proxy.js';
import { MockProcessManager } from '../mocks/MockProcessManager.js';
import { MockFileSystem } from '../mocks/MockFileSystem.js';
import { MockChangeSource } from '../mocks/MockChangeSource.js';
import type { ProxyDependencies } from '../../src/interfaces.js';

describe('Docker Container ID Tracking', () => {
  let mockProcessManager: MockProcessManager;
  let mockFileSystem: MockFileSystem;
  let mockChangeSource: MockChangeSource;
  let proxyDependencies: ProxyDependencies;
  let activeProxies: MCPProxy[] = [];

  beforeEach(() => {
    mockProcessManager = new MockProcessManager();
    mockFileSystem = new MockFileSystem();
    mockChangeSource = new MockChangeSource();
    activeProxies = [];

    // Create mock streams
    const { readable: stdinReadable, writable: stdinWritable } = new TransformStream<Uint8Array>();
    const { readable: stdoutReadable, writable: stdoutWritable } = new TransformStream<Uint8Array>();
    const { readable: stderrReadable, writable: stderrWritable } = new TransformStream<Uint8Array>();

    // Create proxy dependencies
    proxyDependencies = {
      procManager: mockProcessManager,
      changeSource: mockChangeSource,
      stdin: stdinReadable,
      stdout: stdoutWritable,
      stderr: stderrWritable,
      exit: () => {}
    };
  });

  afterEach(async () => {
    // Clean up all active proxies quickly
    for (const proxy of activeProxies) {
      try {
        // Kill any running processes first
        const processes = mockProcessManager.getAllSpawnedProcesses();
        processes.forEach(proc => {
          if (!proc.hasExited()) {
            proc.simulateExit(0);
          }
        });
        
        await Promise.race([
          proxy.shutdown(),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
        ]);
      } catch (e) {
        // Ignore shutdown errors
      }
    }
    activeProxies = [];
  }, 2000); // 2 second timeout for cleanup

  it('should initialize containerId property as undefined', () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'my-mcp-server:latest'],
      restartDelay: 100
    });

    // Verify containerId property exists and is initially undefined
    expect((proxy as any).containerId).toBeUndefined();
  });

  it('should allow manual setting of containerId for testing', () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'my-mcp-server:latest'],
      restartDelay: 100
    });

    const testContainerId = 'test-container-123';
    
    // Manually set container ID (simulating what DOCKERFIX-1 will implement)
    (proxy as any).containerId = testContainerId;
    
    // Verify it was set
    expect((proxy as any).containerId).toBe(testContainerId);
  });

  it('should detect docker run commands in startServer', async () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'my-mcp-server:latest'],
      restartDelay: 100
    });
    activeProxies.push(proxy);

    // Start proxy (don't await - it runs forever)
    proxy.start();

    // Wait for spawn
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify docker run was called
    const spawnCalls = mockProcessManager.spawnCalls;
    const dockerRunCall = spawnCalls.find(call => 
      call.command === 'docker' && 
      call.args.includes('run') && 
      call.args.includes('-d')
    );
    
    expect(dockerRunCall).toBeDefined();
    expect(dockerRunCall?.args).toContain('run');
    expect(dockerRunCall?.args).toContain('-d');
  }, 5000);

  it('should handle multiple proxies with separate container IDs', () => {
    const proxy1 = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'mcp-server-1:latest'],
      restartDelay: 100
    });

    const proxy2 = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'mcp-server-2:latest'],
      restartDelay: 100
    });

    const containerId1 = 'container-instance-1';
    const containerId2 = 'container-instance-2';

    // Set different container IDs
    (proxy1 as any).containerId = containerId1;
    (proxy2 as any).containerId = containerId2;

    // Verify each proxy has its own container ID
    expect((proxy1 as any).containerId).toBe(containerId1);
    expect((proxy2 as any).containerId).toBe(containerId2);
    expect((proxy1 as any).containerId).not.toBe((proxy2 as any).containerId);
  });

  it('should validate Docker command structure', () => {
    // Test case: Docker run command
    const dockerProxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', '--name', 'test-container', 'my-image:latest'],
      restartDelay: 100
    });

    // Test case: Non-Docker command
    const nodeProxy = new MCPProxy(proxyDependencies, {
      command: 'node',
      commandArgs: ['server.js'],
      restartDelay: 100
    });

    // The proxy should be created successfully regardless of command type
    expect(dockerProxy).toBeDefined();
    expect(nodeProxy).toBeDefined();
    
    // Both should have undefined containerId initially
    expect((dockerProxy as any).containerId).toBeUndefined();
    expect((nodeProxy as any).containerId).toBeUndefined();
  });

  it('should track Docker command arguments correctly', async () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', '--name', 'test-server', '--label', 'type=mcp', 'my-image:latest'],
      restartDelay: 100
    });
    activeProxies.push(proxy);

    // Start proxy
    proxy.start();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that the spawn was called with correct arguments
    const spawnCalls = mockProcessManager.spawnCalls;
    expect(spawnCalls.length).toBeGreaterThan(0);
    
    const dockerCall = spawnCalls[0];
    expect(dockerCall.command).toBe('docker');
    expect(dockerCall.args).toContain('run');
    expect(dockerCall.args).toContain('-d');
    expect(dockerCall.args).toContain('--name');
    expect(dockerCall.args).toContain('test-server');
  }, 5000);

  it('should inject Docker session labels', async () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', 'my-mcp-server:latest'],
      restartDelay: 100
    });
    activeProxies.push(proxy);

    // Start proxy
    proxy.start();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that labels were injected into Docker run command
    const spawnCalls = mockProcessManager.spawnCalls;
    expect(spawnCalls.length).toBeGreaterThan(0);
    
    const dockerCall = spawnCalls[0];
    expect(dockerCall.command).toBe('docker');
    expect(dockerCall.args).toContain('run');
    
    // Should have labels injected
    const hasLabel = dockerCall.args.some(arg => arg.includes('--label'));
    expect(hasLabel).toBe(true);
    
    // Should have mcpmon session label
    const hasSessionLabel = dockerCall.args.some(arg => arg.includes('mcpmon.session'));
    expect(hasSessionLabel).toBe(true);
  }, 5000);

  it('should not inject labels for non-Docker commands', async () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'node',
      commandArgs: ['server.js'],
      restartDelay: 100
    });
    activeProxies.push(proxy);

    // Start proxy
    proxy.start();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that no labels were injected
    const spawnCalls = mockProcessManager.spawnCalls;
    expect(spawnCalls.length).toBeGreaterThan(0);
    
    const nodeCall = spawnCalls[0];
    expect(nodeCall.command).toBe('node');
    expect(nodeCall.args).toEqual(['server.js']); // Should be unchanged
  }, 5000);

  it('should create proxy with proper Docker configuration', () => {
    const proxy = new MCPProxy(proxyDependencies, {
      command: 'docker',
      commandArgs: ['run', '-d', '-p', '3000:3000', 'my-server:latest'],
      restartDelay: 100
    });

    // Verify proxy was created successfully
    expect(proxy).toBeDefined();
    expect(typeof (proxy as any).killServer).toBe('function');
    expect(typeof (proxy as any).startServer).toBe('function');
    expect((proxy as any).containerId).toBeUndefined();
  });
});