/// <reference path="./global.d.ts" />
/**
 * Behavioral tests for the reload tool functionality
 *
 * Tests the built-in mcpmon_reload-server tool integration:
 * - Tool appears in tools/list response
 * - Tool call triggers restart
 * - Error when already restarting
 *
 * Uses mock implementations to verify behavior without actual process spawning.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { setupProxyTest, waitForSpawns, waitForStable } from "./test_helper.js";

describe("Reload Tool Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Tool appears in tools/list response", async () => {
    const { proxy, procManager, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start();
      await waitForSpawns(procManager, 1);

      // Get the spawned process
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error("Initial process should exist");

      // Mock the sendRequest method to return controlled responses
      const originalSendRequest = (proxy as any).sendRequest;
      (proxy as any).sendRequest = jest.fn((method: string, params: any) => {
        if (method === "initialize") {
          return Promise.resolve({
            jsonrpc: "2.0",
            id: 1,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {}
            }
          });
        } else if (method === "tools/list") {
          return Promise.resolve({
            jsonrpc: "2.0",
            id: 2,
            result: {
              tools: [] // Empty tools array from server
            }
          });
        }
        return originalSendRequest.call(proxy, method, params);
      });

      // Set up the initializeParams to simulate a proper initialization
      (proxy as any).initializeParams = {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      };

      // Now test the getToolsList method
      const toolsList = await (proxy as any).getToolsList();
      
      expect(toolsList).toBeDefined();
      expect(toolsList).toBeInstanceOf(Array);
      expect(toolsList.length).toBeGreaterThan(0);
      
      // Find the reload tool in the tools list
      const reloadTool = toolsList.find((tool: any) => tool.name === "mcpmon_reload-server");
      expect(reloadTool).toBeDefined();
      expect(reloadTool.name).toBe("mcpmon_reload-server");
      expect(reloadTool.description).toBe("Manually reload the MCP server (useful for troubleshooting or dependency updates)");
      expect(reloadTool.inputSchema).toBeDefined();
      expect(reloadTool.inputSchema.type).toBe("object");
      expect(reloadTool.inputSchema.properties).toBeDefined();
      expect(reloadTool.inputSchema.properties.reason).toBeDefined();
      expect(reloadTool.inputSchema.properties.reason.type).toBe("string");
      expect(reloadTool.inputSchema.additionalProperties).toBe(false);
    } finally {
      await teardown();
    }
  });

  it("Tool call triggers restart", async () => {
    const { proxy, procManager, stdinWriter, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start();
      await waitForSpawns(procManager, 1);

      // Get the spawned process and simulate it responding to initialize
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error("Initial process should exist");

      // Simulate server responding to initialize
      initialProcess.simulateStdout(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {}
          }
        }) + "\n"
      );

      // Wait for initialization to complete
      await waitForStable(150);

      // Mock the restart method to verify it's called
      const originalRestart = (proxy as any).restart;
      const mockRestart = jest.fn();
      (proxy as any).restart = mockRestart;

      // Send a tool call message for the reload tool
      const toolCallMessage = {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          name: "mcpmon_reload-server",
          arguments: {
            reason: "Test reload"
          }
        }
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(toolCallMessage) + "\n"));

      // Wait for the message to be processed
      await waitForStable(200);

      // Verify restart was called exactly once
      expect(mockRestart).toHaveBeenCalledTimes(1);

      // Restore original restart method
      (proxy as any).restart = originalRestart;
    } finally {
      await teardown();
    }
  });

  it("Error when already restarting", async () => {
    const { proxy, procManager, stdinWriter, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy and wait for initial spawn
      proxy.start();
      await waitForSpawns(procManager, 1);

      // Get the spawned process and simulate it responding to initialize
      const initialProcess = procManager.getLastSpawnedProcess();
      expect(initialProcess).toBeTruthy();
      if (!initialProcess) throw new Error("Initial process should exist");

      // Simulate server responding to initialize
      initialProcess.simulateStdout(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {}
          }
        }) + "\n"
      );

      // Wait for initialization to complete
      await waitForStable(150);

      // Mock the restart method to throw an error to simulate failure
      const originalRestart = (proxy as any).restart;
      const mockRestart = jest.fn(() => {
        throw new Error("Already restarting");
      });
      (proxy as any).restart = mockRestart;

      // Send a tool call message for the reload tool
      const toolCallMessage = {
        jsonrpc: "2.0",
        id: 43,
        method: "tools/call",
        params: {
          name: "mcpmon_reload-server",
          arguments: {
            reason: "Test reload during restart"
          }
        }
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(toolCallMessage) + "\n"));

      // Wait for the message to be processed
      await waitForStable(200);

      // Verify restart was called and threw error
      expect(mockRestart).toHaveBeenCalledTimes(1);

      // Restore original restart method
      (proxy as any).restart = originalRestart;
    } finally {
      await teardown();
    }
  });
});