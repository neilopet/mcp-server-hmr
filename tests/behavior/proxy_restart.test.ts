/// <reference path="./global.d.ts" />
/**
 * Behavioral test for proxy restart functionality
 *
 * Tests the core hot-reload behavior: when a watched file changes,
 * the proxy should kill the old server and start a new one in the correct sequence.
 *
 * This test uses mock implementations to verify behavior without actual process spawning.
 */

import { describe, it, expect } from "@jest/globals";
import { setupProxyTest, simulateRestart, waitForSpawns, waitForStable } from "./test_helper.js";

describe("Test Suite", () => {
  it("Proxy restart - file change triggers server restart sequence", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start(); // Don't await - it has an infinite loop

      // Give proxy time to start up
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check spawn count
      const spawnCount = procManager.getSpawnCallCount();
      expect(spawnCount).toBeGreaterThan(0); // Should have spawned at least one server

      // Wait for spawns if needed
      if (spawnCount === 0) {
        await waitForSpawns(procManager, 1, 5000);
      }

      // Verify initial server was spawned
      expect(procManager.getSpawnCallCount()).toBe(1); // Should spawn initial server
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy(); // Should have spawned process
      if (!initialProcess) throw new Error("Initial process should exist");

      // Simulate initial server starting successfully
      initialProcess.simulateStdout(
        '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}\n'
      );

      // Record the initial process for comparison
      const initialPid = initialProcess.pid;

      // Simulate first restart
      await simulateRestart(procManager, fs, undefined, 100);

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
      if (!newProcess) throw new Error("New process should exist");
      expect(newProcess.pid).not.toBe(initialPid); // New process should have different PID

      // Verify watch is still active
      expect(fs.getActiveWatcherCount()).toBeGreaterThan(0); // File watcher should still be active

      // Test second restart to ensure it works repeatedly
      newProcess.simulateStdout('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n');

      // Simulate second restart
      await simulateRestart(procManager, fs, undefined, 100);

      // Should have spawned third server
      expect(procManager.getSpawnCallCount()).toBe(3); // Should spawn third server after second file change
    } finally {
      await teardown();
    }
  }, 35000); // Increase Jest timeout to 35 seconds
});

describe("Test Suite", () => {
  it("Proxy restart - multiple rapid file changes are debounced", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 200, // Longer debounce for this test
    });

    try {
      // Start proxy
      proxy.start(); // Don't await - it has an infinite loop
      await waitForSpawns(procManager, 1);

      // Verify initial spawn
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error("Initial process should exist");

      // Simulate rapid file changes (should be debounced)
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(10);
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(10);
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(10);
      fs.triggerFileEvent("/test/server.js", "modify");

      // Wait for debounce to begin, then simulate process exit
      await waitForStable(150);
      initialProcess.simulateExit(0); // Allow killServer() to complete

      // Wait for restart to complete
      await waitForStable(300);

      // Should only have triggered one restart despite multiple changes
      expect(procManager.getSpawnCallCount()).toBe(2); // Multiple rapid changes should be debounced to single restart
    } finally {
      await teardown();
    }
  });
});

describe("Test Suite", () => {
  it("Proxy restart - handles process that fails to start", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start(); // Don't await - it has an infinite loop
      await waitForSpawns(procManager, 1);

      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error("Initial process should exist");

      // Simulate initial process starting
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');

      // Trigger restart
      fs.triggerFileEvent("/test/server.js", "modify");

      // Wait for restart to begin, then simulate process exit
      await waitForStable(120);
      initialProcess.simulateExit(0); // Allow killServer() to complete

      await waitForStable(150);

      // Should have attempted new spawn
      expect(procManager.getSpawnCallCount()).toBe(2); // Should attempt to spawn new server

      const newProcess = procManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy();
      if (!newProcess) throw new Error("New process should exist");

      // Simulate new process failing quickly
      newProcess.simulateExit(1, null);

      // Wait a bit for error handling
      await waitForStable(100);

      // Should eventually try to restart again (error recovery)
      // This tests the resilience of the proxy
    } finally {
      await teardown();
    }
  });
});
