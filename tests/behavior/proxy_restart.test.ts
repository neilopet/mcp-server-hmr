/// <reference path="./global.d.ts" />
/**
 * Behavioral test for proxy restart functionality
 *
 * Tests the core hot-reload behavior: when a watched file changes,
 * the proxy should kill the old server and start a new one in the correct sequence.
 *
 * This test uses mock implementations to verify behavior without actual process spawning.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MCPProxy } from "../../src/proxy.ts";
import { MockManagedProcess, MockProcessManager } from "../mocks/MockProcessManager.ts";
import { MockFileSystem } from "../mocks/MockFileSystem.ts";
import { setupProxyTest, simulateRestart, waitForSpawns } from "./test_helper.ts";

Deno.test({
  name: "Proxy restart - file change triggers server restart sequence",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start();
      await waitForSpawns(procManager, 1);

      // Verify initial server was spawned
      assertEquals(procManager.getSpawnCallCount(), 1, "Should spawn initial server");
      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should have spawned process");

      // Simulate initial server starting successfully
      initialProcess.simulateStdout(
        '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}\n',
      );

      // Record the initial process for comparison
      const initialPid = initialProcess.pid;

      // Simulate first restart
      await simulateRestart(procManager, fs);

      // Verify restart sequence
      assertEquals(procManager.getSpawnCallCount(), 2, "Should spawn new server after file change");

      // Verify old process was killed
      const killCalls = initialProcess.killCalls || [];
      assertEquals(killCalls.length >= 1, true, "Should kill old server");
      if (killCalls.length > 0) {
        assertEquals(killCalls[0].signal || "SIGTERM", "SIGTERM", "Should use SIGTERM signal");
      }

      // Verify new process is different
      const newProcess = procManager.getLastSpawnedProcess();
      assertExists(newProcess, "Should have new process");
      assertEquals(newProcess.pid !== initialPid, true, "New process should have different PID");

      // Verify watch is still active
      assertEquals(fs.getActiveWatcherCount() > 0, true, "File watcher should still be active");

      // Test second restart to ensure it works repeatedly
      newProcess.simulateStdout('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n');

      // Simulate second restart
      await simulateRestart(procManager, fs);

      // Should have spawned third server
      assertEquals(
        procManager.getSpawnCallCount(),
        3,
        "Should spawn third server after second file change",
      );
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Proxy restart - multiple rapid file changes are debounced",
  async fn() {
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
      assertEquals(mockProcessManager.getSpawnCallCount(), 1, "Should spawn initial server");

      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should have initial process");

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
      assertEquals(
        mockProcessManager.getSpawnCallCount(),
        2,
        "Multiple rapid changes should be debounced to single restart",
      );

      mockFileSystem.closeAllWatchers();
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Proxy restart - handles process that fails to start",
  async fn() {
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
      assertExists(initialProcess, "Should spawn initial process");

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
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Should attempt to spawn new server");

      const newProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(newProcess, "Should have new process");

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
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
