/// <reference path="./global.d.ts" />
/**
 * Behavioral test for error handling scenarios
 *
 * Tests that the proxy handles various error conditions gracefully:
 * - Process spawn failures
 * - File watching errors
 * - Process crashes
 * - Network/stream errors
 * - Invalid message formats
 *
 * Ensures robust operation and proper error recovery.
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MCPProxy } from "../../src/proxy.ts";
import { MockManagedProcess, MockProcessManager } from "../mocks/MockProcessManager.ts";
import { MockFileSystem } from "../mocks/MockFileSystem.ts";
import { setupProxyTest, simulateRestart, waitForSpawns, waitForStable } from "./test_helper.ts";

Deno.test({
  name: "Error handling - process spawn failure",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    // Configure spawn to fail
    procManager.setSpawnShouldFail(true);

    try {
      // Start proxy - this should handle spawn failure gracefully
      const proxyStartPromise = proxy.start();

      // Give it time to attempt spawn and handle failure
      await waitForStable(100);

      // Should have attempted to spawn
      assertEquals(procManager.getSpawnCallCount(), 1, "Should attempt to spawn");

      // The proxy should handle the spawn failure and potentially retry
      // Exact behavior depends on implementation, but it shouldn't crash

      // Reset spawn failure for testing recovery
      procManager.setSpawnShouldFail(false);

      // Trigger a restart to test recovery
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(200);

      // Should successfully spawn on retry
      assertEquals(procManager.getSpawnCallCount(), 2, "Should retry spawn after failure");

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - file watching failure",
  async fn() {
    // Create test context but don't set file as existing to simulate watch failure
    const procManager = new MockProcessManager();
    const fs = new MockFileSystem();
    // Don't set file as existing to simulate watch failure

    const { proxy, teardown } = setupProxyTest({
      // Override the setup to use our custom mocks
    });

    // Create a new proxy with our custom mocks that don't have the file set as existing
    const { readable: stdinReadable, writable: stdinWritable } = new TransformStream<Uint8Array>();
    const { readable: stdoutReadable, writable: stdoutWritable } = new TransformStream<
      Uint8Array
    >();
    const { readable: stderrReadable, writable: stderrWritable } = new TransformStream<
      Uint8Array
    >();

    const customProxy = new MCPProxy({
      procManager,
      fs,
      stdin: stdinReadable,
      stdout: stdoutWritable,
      stderr: stderrWritable,
      exit: (code: number) => {/* Mock exit - don't actually exit during tests */},
    }, {
      command: "node",
      commandArgs: ["/test/server.js"],
      entryFile: "/test/server.js",
      restartDelay: 50,
      killDelay: 50,
      readyDelay: 50,
    });

    try {
      // Start proxy - file watching should fail but proxy should continue
      const proxyStartPromise = customProxy.start();
      await waitForStable(100);

      // Should still spawn initial server even if file watching fails
      assertEquals(procManager.getSpawnCallCount(), 1, "Should spawn server despite watch failure");

      // File watching should not be active
      assertEquals(fs.getActiveWatcherCount(), 0, "Should not have active watchers due to failure");

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      fs.closeAllWatchers();
      try {
        await customProxy.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - process crash during operation",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await waitForStable(50);

      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");

      // Simulate process starting successfully
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');

      // Simulate unexpected process crash
      initialProcess.simulateExit(1, "SIGKILL");

      // Wait for proxy to detect crash and restart
      await waitForStable(300);

      // Proxy should attempt to restart after crash
      assertEquals(
        procManager.getSpawnCallCount() >= 2,
        true,
        "Should restart after process crash",
      );

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - invalid JSON messages",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await waitForStable(50);

      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");

      // Simulate server sending invalid JSON
      initialProcess.simulateStdout("invalid json\n");
      initialProcess.simulateStdout('{"incomplete": json\n');
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n'); // Valid message

      // Proxy should handle invalid JSON gracefully and continue operating
      // The valid message should still be processed

      // Use simulateRestart helper instead of manual restart sequence
      await simulateRestart(procManager, fs);

      assertEquals(
        procManager.getSpawnCallCount(),
        2,
        "Should continue operating despite invalid JSON",
      );

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - stream errors",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest();

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await waitForStable(50);

      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");

      // Simulate stream working initially
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');

      // Simulate stream error by closing streams abruptly
      initialProcess.simulateExit(0, null);

      // Wait for proxy to handle stream closure
      await waitForStable(200);

      // Proxy should detect stream closure and attempt restart
      assertEquals(procManager.getSpawnCallCount() >= 2, true, "Should restart after stream error");

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - filesystem operations failure",
  async fn() {
    // Create custom mocks with filesystem failures
    const procManager = new MockProcessManager();
    const fs = new MockFileSystem();

    // Configure filesystem operations to fail
    fs.setFailures({
      read: true,
      write: true,
      exists: true,
      copy: true,
      message: "Mock filesystem error",
    });

    // Create mock I/O streams for testing
    const { readable: stdinReadable, writable: stdinWritable } = new TransformStream<Uint8Array>();
    const { readable: stdoutReadable, writable: stdoutWritable } = new TransformStream<
      Uint8Array
    >();
    const { readable: stderrReadable, writable: stderrWritable } = new TransformStream<
      Uint8Array
    >();

    const proxy = new MCPProxy({
      procManager,
      fs,
      stdin: stdinReadable,
      stdout: stdoutWritable,
      stderr: stderrWritable,
      exit: (code: number) => {/* Mock exit - don't actually exit during tests */},
    }, {
      command: "node",
      commandArgs: ["/test/server.js"],
      entryFile: "/test/server.js",
      restartDelay: 50,
      killDelay: 50,
      readyDelay: 50,
    });

    try {
      // Start proxy - should handle filesystem failures gracefully
      const proxyStartPromise = proxy.start();
      await waitForStable(100);

      // The exact behavior depends on implementation
      // But proxy should not crash due to filesystem errors

      // Reset filesystem failures
      fs.setFileExists("/test/server.js", true);

      // Should be able to recover when filesystem is working again
      await waitForStable(100);

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      fs.closeAllWatchers();
      try {
        await proxy.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - multiple concurrent errors",
  async fn() {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 50, // Short delay for faster testing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await waitForStable(50);

      const initialProcess = procManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");

      // Simulate multiple errors happening simultaneously:
      // 1. Process crash
      initialProcess.simulateExit(1, "SIGKILL");

      // 2. File change events during crash
      fs.triggerFileEvent("/test/server.js", "modify");
      fs.triggerFileEvent("/test/server.js", "modify");

      // 3. Configure next spawn to fail temporarily
      procManager.setSpawnShouldFail(true);

      await waitForStable(100);

      // Reset spawn failure
      procManager.setSpawnShouldFail(false);

      // 4. More file changes
      fs.triggerFileEvent("/test/server.js", "modify");

      await waitForStable(200);

      // Despite multiple concurrent errors, proxy should eventually stabilize
      assertEquals(procManager.getSpawnCallCount() >= 2, true, "Should attempt multiple restarts");

      // Ensure any spawned process is terminated before teardown
      const lastProcess = procManager.getLastSpawnedProcess();
      if (lastProcess) {
        lastProcess.simulateExit(0);
      }
    } finally {
      await teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
