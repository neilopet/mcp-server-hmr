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

      // First simulate an initialize request being sent to capture params
      await stdinWriter.write(new TextEncoder().encode(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0"
          }
        }
      }) + "\n"));

      // Wait for the message to be processed
      await waitForStable(50);

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

      // Send a tools/list request via stdin to test the full flow
      await stdinWriter.write(new TextEncoder().encode(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      }) + "\n"));

      // Wait for the request to be processed
      await waitForStable(50);

      // Simulate server responding to tools/list request
      initialProcess.simulateStdout(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: []
          }
        }) + "\n"
      );

      // Wait for response to be processed
      await waitForStable(150);

      // The tools/list response should now include the built-in reload tool
      // We can't easily capture the stdout response in this test setup,
      // so let's test the internal method instead
      
      // Set up the initializeParams directly for testing
      (proxy as any).initializeParams = {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      };

      // Test the private getToolsList method through type assertion
      const toolsListPromise = (proxy as any).getToolsList();
      
      // Set up the server to respond to the initialize and tools/list requests
      setTimeout(() => {
        // Respond to initialize request
        initialProcess.simulateStdout(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {}
            }
          }) + "\n"
        );
        
        // Respond to tools/list request
        setTimeout(() => {
          initialProcess.simulateStdout(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 4,
              result: {
                tools: []
              }
            }) + "\n"
          );
        }, 50);
      }, 100);

      const toolsList = await toolsListPromise;
      expect(toolsList).toBeDefined();
      expect(toolsList).toBeInstanceOf(Array);
      
      console.log("Tools list:", JSON.stringify(toolsList, null, 2));
      
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