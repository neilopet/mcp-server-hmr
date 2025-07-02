/**
 * Error scenario tests for uncovered error paths
 *
 * Tests error handling scenarios that weren't covered by existing tests:
 * - Server initialization failures
 * - Process error handling during monitoring
 * - Stream forwarding errors
 * - Request timeout scenarios
 */

import { describe, it, expect } from "@jest/globals";
import { setupProxyTest, waitForSpawns, waitForStable } from "./test_helper.js";

describe("Error Scenarios", () => {
  it("should handle server initialization failure", async () => {
    const { proxy, procManager, fs, teardown, stdinWriter, stdoutReader } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Send initialize request
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Forward the request to server
      process?.simulateStdin(JSON.stringify(initRequest) + "\n");

      // Simulate server responding with success to capture params
      process?.simulateStdout(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} }
        }
      }) + "\n");

      // Wait for initialization to complete
      await waitForStable(100);

      // Now trigger a restart
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(100);

      // Simulate old process exit
      process?.simulateExit(0);
      await waitForSpawns(procManager, 2);

      const newProcess = procManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy();

      // When proxy tries to initialize the new server, simulate an error
      newProcess?.simulateStdout(JSON.stringify({
        jsonrpc: "2.0",
        id: 2, // Proxy will use a new ID
        error: {
          code: -32603,
          message: "Server initialization failed: Missing required environment variables"
        }
      }) + "\n");

      // Wait for error handling
      await waitForStable(200);

      // Verify process continues running despite init failure
      expect(procManager.getKillCallCount()).toBe(1); // Only the restart kill
      expect(procManager.getSpawnCallCount()).toBe(2);
    } finally {
      await teardown();
    }
  });

  it("should handle server process errors during monitoring", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Wait for stable state
      await waitForStable(100);

      // Simulate process error (not exit, but error event)
      process?.simulateError(new Error("Process stream error"));

      // Wait for error handling and retry
      await waitForStable(1200); // Should wait 1000ms before retry

      // Should attempt to restart the server
      expect(procManager.getSpawnCallCount()).toBeGreaterThanOrEqual(2);
    } finally {
      await teardown();
    }
  });

  it("should handle stdin forwarding parse errors", async () => {
    const { proxy, procManager, fs, teardown, stdinWriter } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Send invalid JSON to stdin
      await stdinWriter.write(new TextEncoder().encode("{ invalid json }\n"));
      await stdinWriter.write(new TextEncoder().encode("not json at all\n"));
      await stdinWriter.write(new TextEncoder().encode('{"valid": "json"}\n'));

      // Wait for processing
      await waitForStable(100);

      // Process should still be running
      expect(process?.hasExited()).toBe(false);
      expect(procManager.getKillCallCount()).toBe(0);
    } finally {
      await teardown();
    }
  });

  it("should handle stderr forwarding errors", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Simulate stderr data
      process?.simulateStderr("Error message from server\n");
      process?.simulateStderr("Another error line\n");

      // Wait for forwarding
      await waitForStable(100);

      // Process should continue running
      expect(process?.hasExited()).toBe(false);
      expect(procManager.getKillCallCount()).toBe(0);
    } finally {
      await teardown();
    }
  });

  it("should handle request timeouts", async () => {
    const { proxy, procManager, fs, teardown, stdinWriter, stdoutReader } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Send initialize to establish connection
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {} }
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));
      process?.simulateStdin(JSON.stringify(initRequest) + "\n");
      process?.simulateStdout(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } }
      }) + "\n");

      await waitForStable(100);

      // Trigger restart to test internal request timeout
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(100);

      process?.simulateExit(0);
      await waitForSpawns(procManager, 2);

      const newProcess = procManager.getLastSpawnedProcess();

      // Don't respond to tools/list request - let it timeout
      // The proxy will send initialize and then tools/list
      // We'll only respond to initialize
      newProcess?.simulateStdout(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } }
      }) + "\n");

      // Wait for request timeout (5 seconds + buffer)
      await waitForStable(5500);

      // Process should still be running despite timeout
      expect(newProcess?.hasExited()).toBe(false);
      expect(procManager.getSpawnCallCount()).toBe(2);
    } finally {
      await teardown();
    }
  });

  it("should handle file watcher errors for non-existent files", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      entryFile: "/nonexistent/file.js",
      watchTargets: ["/nonexistent/file.js"],
      restartDelay: 50,
    });

    // Remove the file to simulate non-existence
    fs.setFileExists("/nonexistent/file.js", false);

    try {
      // Start proxy - should handle watch error gracefully
      proxy.start();

      // Should still try to start the server
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Process should be running
      expect(process?.hasExited()).toBe(false);
    } finally {
      await teardown();
    }
  });

  it("should handle server not running when sending requests", async () => {
    const { proxy, procManager, fs, teardown, stdinWriter } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Kill the process to simulate crash
      process?.simulateExit(1);

      // Immediately trigger a file change before auto-restart
      fs.triggerFileEvent("/test/server.js", "modify");

      // Wait for debounce
      await waitForStable(100);

      // Try to send a message while server is down
      const message = {
        jsonrpc: "2.0",
        id: 1,
        method: "test",
        params: {}
      };
      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(message) + "\n"));

      // Wait for restart
      await waitForSpawns(procManager, 2);

      // New process should be spawned
      const newProcess = procManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy();
      expect(newProcess?.pid).not.toBe(process?.pid);
    } finally {
      await teardown();
    }
  });

  it("should handle multiple concurrent errors gracefully", async () => {
    const { proxy, procManager, fs, teardown, stdinWriter } = setupProxyTest({
      restartDelay: 50,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Trigger multiple errors simultaneously
      // 1. Send invalid JSON
      await stdinWriter.write(new TextEncoder().encode("invalid json\n"));

      // 2. Trigger file change
      fs.triggerFileEvent("/test/server.js", "modify");

      // 3. Send process error
      process?.simulateError(new Error("Stream error"));

      // 4. Send more invalid data
      await stdinWriter.write(new TextEncoder().encode("{broken\n"));

      // 5. Simulate stderr error
      process?.simulateStderr("Critical error!\n");

      // Wait for all error handling
      await waitForStable(200);

      // Should handle all errors and attempt restart
      expect(procManager.getSpawnCallCount()).toBeGreaterThanOrEqual(2);

      // Get the latest process
      const latestProcess = procManager.getLastSpawnedProcess();
      expect(latestProcess).toBeTruthy();

      // Send valid message to verify proxy is still functional
      const validMessage = {
        jsonrpc: "2.0",
        id: 99,
        method: "test",
        params: {}
      };
      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(validMessage) + "\n"));

      // Verify message was forwarded
      const forwardedData = latestProcess?.getStdinData();
      expect(forwardedData).toContain('"id":99');
    } finally {
      await teardown();
    }
  });

  it("should handle SIGKILL timeout when server doesn't respond to SIGTERM", async () => {
    const { proxy, procManager, fs, teardown } = setupProxyTest({
      restartDelay: 50,
      killDelay: 100, // Short delay for testing
    });

    try {
      // Start proxy
      proxy.start();
      await waitForSpawns(procManager, 1);

      const process = procManager.getLastSpawnedProcess();
      expect(process).toBeTruthy();

      // Configure process to not exit on SIGTERM
      process?.setShouldExitOnSignal(false);

      // Trigger restart
      fs.triggerFileEvent("/test/server.js", "modify");
      await waitForStable(100);

      // Should receive SIGTERM first
      const killCalls = procManager.getKillCalls();
      expect(killCalls.length).toBeGreaterThanOrEqual(1);
      expect(killCalls[0].signal).toBe("SIGTERM");

      // Wait for SIGKILL timeout (5 seconds)
      await waitForStable(5100);

      // Should have sent SIGKILL
      const allKillCalls = procManager.getKillCalls();
      const sigkillCall = allKillCalls.find(call => call.signal === "SIGKILL");
      expect(sigkillCall).toBeTruthy();

      // Process should be forced to exit
      process?.simulateExit(137); // SIGKILL exit code

      // New process should be spawned
      await waitForSpawns(procManager, 2);
      const newProcess = procManager.getLastSpawnedProcess();
      expect(newProcess).toBeTruthy();
      expect(newProcess?.pid).not.toBe(process?.pid);
    } finally {
      await teardown();
    }
  });
});
