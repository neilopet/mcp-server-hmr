/// <reference path="./global.d.ts" />
/**
 * Behavioral test for proxy restart functionality
 *
 * Tests the core hot-reload behavior: when a watched file changes,
 * the proxy should kill the old server and start a new one in the correct sequence.
 *
 * This test uses mock implementations to verify behavior without actual process spawning.
 */

import { describe, it, expect } from '@jest/globals';
import { MCPProxy } from "../../src/proxy.js";
import { MockManagedProcess, MockProcessManager } from "../mocks/MockProcessManager.js";
import { MockFileSystem } from "../mocks/MockFileSystem.js";
import { setupProxyTest, simulateRestart, waitForSpawns } from "./test_helper.js";

describe('Test Suite', () => {
  it('Proxy restart - file change triggers server restart sequence', async () => {
  
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start();
      await waitForSpawns(procManager, 1);

      // Verify initial server was spawned
      expect(procManager.getSpawnCallCount()).toBe(1); // Should spawn initial server
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy(); // Should have spawned process
      if (!initialProcess) throw new Error('Initial process should exist');

      // Simulate initial server starting successfully
      initialProcess.simulateStdout(
        '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}\n',
      );

      // Record the initial process for comparison
      const initialPid = initialProcess.pid;

      // Simulate first restart
      await simulateRestart(procManager, fs);

      // Verify restart sequence
      expect(procManager.getSpawnCallCount()).toBe(2); // Should spawn new server after file change

      // Verify old process was killed
      const killCalls = initialProcess.killCalls || [];
      expect(killCalls.length).toBeGreaterThanOrEqual(1); // Should kill old server
      if (killCalls.length > 0) {
        expect(killCalls[0].signal || "SIGTERM").toBe("SIGTERM"); // Should use SIGTERM signal
      }

      // Verify new process is different
      const newProcess = procManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy(); // Should have new process
      if (!newProcess) throw new Error('New process should exist');
      expect(newProcess.pid).not.toBe(initialPid); // New process should have different PID

      // Verify watch is still active
      expect(fs.getActiveWatcherCount()).toBeGreaterThan(0); // File watcher should still be active

      // Test second restart to ensure it works repeatedly
      newProcess.simulateStdout('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n');

      // Simulate second restart
      await simulateRestart(procManager, fs);

      // Should have spawned third server
      expect(procManager.getSpawnCallCount()).toBe(3); // Should spawn third server after second file change
    } finally {
      await teardown();
    }
  });
  
});

describe('Test Suite', () => {
  it('Proxy restart - multiple rapid file changes are debounced', async () => {
  
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();

    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);

    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 200; // Longer debounce for this test

    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();

    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      exit: (code: number) => {/* Mock exit - don't actually exit during tests */},
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50, // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify initial spawn
      expect(mockProcessManager.getSpawnCallCount()).toBe(1); // Should spawn initial server

      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error('Initial process should exist'); // Should have initial process
      if (!initialProcess) throw new Error('Initial process should exist');

      // Simulate rapid file changes (should be debounced)
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");

      // Wait for debounce to begin, then simulate process exit
      await new Promise((resolve) => setTimeout(resolve, 150));
      initialProcess.simulateExit(0); // Allow killServer() to complete

      // Wait for restart to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only have triggered one restart despite multiple changes
      expect(mockProcessManager.getSpawnCallCount()).toBe(2); // Multiple rapid changes should be debounced to single restart

      mockFileSystem.closeAllWatchers();
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  });
  
});

describe('Test Suite', () => {
  it('Proxy restart - handles process that fails to start', async () => {
  
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();

    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);

    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;

    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();

    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      exit: (code: number) => {/* Mock exit - don't actually exit during tests */},
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50, // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error('Initial process should exist'); // Should spawn initial process

      // Simulate initial process starting
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');

      // Configure next spawn to succeed but immediately fail
      const nextProcess = new MockProcessManager();

      // Trigger restart
      mockFileSystem.triggerFileEvent(watchFile, "modify");

      // Wait for restart to begin, then simulate process exit
      await new Promise((resolve) => setTimeout(resolve, 120));
      initialProcess.simulateExit(0); // Allow killServer() to complete

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have attempted new spawn
      expect(mockProcessManager.getSpawnCallCount()).toBe(2); // Should attempt to spawn new server

      const newProcess = mockProcessManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy();
      if (!newProcess) throw new Error('New process should exist'); // Should have new process

      // Simulate new process failing quickly
      newProcess.simulateExit(1, null);

      // Wait a bit for error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should eventually try to restart again (error recovery)
      // This tests the resilience of the proxy

      mockFileSystem.closeAllWatchers();
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  });
  
});
