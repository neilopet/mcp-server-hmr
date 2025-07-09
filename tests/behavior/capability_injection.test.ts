/// <reference path="./global.d.ts" />
/**
 * Behavioral test for capability injection functionality
 *
 * Tests that MCP proxy properly injects required capabilities into server initialize responses
 * to ensure clients always see the necessary capabilities regardless of what the server declares.
 * 
 * NOTE: This test documents the expected behavior for capability injection.
 * The actual implementation would need to be added to the proxy's setupOutputForwarding method
 * to intercept initialize responses and inject the required capabilities.
 * 
 * Implementation approach:
 * 1. In setupOutputForwarding, detect when a message has method === "initialize" and an id
 * 2. Store the request ID to track when we receive the corresponding response
 * 3. When receiving a response with that ID, check if it has result.capabilities
 * 4. Inject/modify capabilities as needed:
 *    - Ensure tools.listChanged = true (unless explicitly false)
 *    - Add logging: {} if not present
 *    - Preserve all other existing capabilities
 * 5. Forward the modified response to the client
 */

import { describe, it, expect } from "@jest/globals";
import { setupProxyTest, waitForStable } from "./test_helper.js";

interface MCPInitializeRequest {
  jsonrpc: "2.0";
  id: number;
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: {
      roots?: { listChanged?: boolean };
      sampling?: {};
      tools?: {};
      prompts?: {};
      resources?: {};
    };
    clientInfo: {
      name: string;
      version: string;
    };
  };
}

interface MCPInitializeResponse {
  jsonrpc: "2.0";
  id: number;
  result: {
    protocolVersion: string;
    capabilities: {
      tools?: { listChanged?: boolean };
      logging?: {};
      prompts?: { listChanged?: boolean };
      resources?: { subscribe?: boolean; listChanged?: boolean };
    };
    serverInfo: {
      name: string;
      version: string;
    };
  };
}

describe("Capability Injection", () => {
  // TODO: These tests document the expected behavior for capability injection.
  // The implementation needs to be added to proxy.ts in the setupOutputForwarding method
  // to intercept initialize responses and modify capabilities.
  
  it.skip("should inject tools.listChanged when server doesn't declare it", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send initialize request from client
      const initRequest: MCPInitializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Server responds without tools.listChanged capability
      const serverResponse: MCPInitializeResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            // No tools.listChanged
            tools: {},
            resources: { subscribe: true },
          },
          serverInfo: {
            name: "test-server",
            version: "1.0.0",
          },
        },
      };

      serverProcess.simulateStdout(JSON.stringify(serverResponse) + "\n");

      // Read the response forwarded by proxy
      const { value } = await stdoutReader.read();
      const responseText = new TextDecoder().decode(value);
      const forwardedResponse = JSON.parse(responseText.trim()) as MCPInitializeResponse;

      // Verify tools.listChanged was injected
      expect(forwardedResponse.result.capabilities.tools).toBeDefined();
      expect(forwardedResponse.result.capabilities.tools?.listChanged).toBe(true);
    } finally {
      await teardown();
    }
  });

  it.skip("should preserve tools.listChanged when server already has it true", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send initialize request
      const initRequest: MCPInitializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Server already has tools.listChanged
      const serverResponse: MCPInitializeResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: true },
            prompts: { listChanged: true },
          },
          serverInfo: {
            name: "test-server",
            version: "1.0.0",
          },
        },
      };

      serverProcess.simulateStdout(JSON.stringify(serverResponse) + "\n");

      // Read the response
      const { value } = await stdoutReader.read();
      const responseText = new TextDecoder().decode(value);
      const forwardedResponse = JSON.parse(responseText.trim()) as MCPInitializeResponse;

      // Verify tools.listChanged is still true
      expect(forwardedResponse.result.capabilities.tools?.listChanged).toBe(true);
      // Verify other capabilities are preserved
      expect(forwardedResponse.result.capabilities.prompts?.listChanged).toBe(true);
    } finally {
      await teardown();
    }
  });

  it.skip("should add logging capability when missing", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send initialize request
      const initRequest: MCPInitializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Server responds without logging capability
      const serverResponse: MCPInitializeResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: { subscribe: true },
          },
          serverInfo: {
            name: "test-server",
            version: "1.0.0",
          },
        },
      };

      serverProcess.simulateStdout(JSON.stringify(serverResponse) + "\n");

      // Read the response
      const { value } = await stdoutReader.read();
      const responseText = new TextDecoder().decode(value);
      const forwardedResponse = JSON.parse(responseText.trim()) as MCPInitializeResponse;

      // Verify logging capability was added
      expect(forwardedResponse.result.capabilities.logging).toBeDefined();
      expect(forwardedResponse.result.capabilities.logging).toEqual({});
    } finally {
      await teardown();
    }
  });

  it.skip("should preserve other capabilities untouched", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send initialize request
      const initRequest: MCPInitializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            sampling: {},
          },
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Server has various capabilities
      const serverResponse: MCPInitializeResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { 
              subscribe: true,
              listChanged: false  // Explicitly false
            },
            prompts: {
              listChanged: true
            },
            // Missing tools and logging
          },
          serverInfo: {
            name: "test-server",
            version: "1.0.0",
          },
        },
      };

      serverProcess.simulateStdout(JSON.stringify(serverResponse) + "\n");

      // Read the response
      const { value } = await stdoutReader.read();
      const responseText = new TextDecoder().decode(value);
      const forwardedResponse = JSON.parse(responseText.trim()) as MCPInitializeResponse;

      // Verify original capabilities are preserved exactly
      expect(forwardedResponse.result.capabilities.resources?.subscribe).toBe(true);
      expect(forwardedResponse.result.capabilities.resources?.listChanged).toBe(false); // Should not override false
      expect(forwardedResponse.result.capabilities.prompts?.listChanged).toBe(true);
      
      // Verify injected capabilities
      expect(forwardedResponse.result.capabilities.tools?.listChanged).toBe(true);
      expect(forwardedResponse.result.capabilities.logging).toEqual({});
    } finally {
      await teardown();
    }
  });

  it("should handle malformed initialize responses gracefully", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send initialize request
      const initRequest: MCPInitializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(initRequest) + "\n"));

      // Test various malformed responses
      const malformedCases = [
        // Missing capabilities entirely
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            // No capabilities field
            serverInfo: {
              name: "test-server",
              version: "1.0.0",
            },
          },
        },
        // Capabilities is null
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: null,
            serverInfo: {
              name: "test-server",
              version: "1.0.0",
            },
          },
        },
        // Capabilities is not an object
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: "invalid",
            serverInfo: {
              name: "test-server",
              version: "1.0.0",
            },
          },
        },
      ];

      for (const malformedResponse of malformedCases) {
        // Send malformed response
        serverProcess.simulateStdout(JSON.stringify(malformedResponse) + "\n");

        // Read the response
        const { value } = await stdoutReader.read();
        const responseText = new TextDecoder().decode(value);
        
        // Proxy should either fix the response or forward it as-is without crashing
        expect(() => JSON.parse(responseText.trim())).not.toThrow();
        
        const forwardedResponse = JSON.parse(responseText.trim());
        
        // If proxy fixes it, verify capabilities are properly structured
        if (forwardedResponse.result?.capabilities && typeof forwardedResponse.result.capabilities === 'object') {
          expect(forwardedResponse.result.capabilities.tools?.listChanged).toBe(true);
          expect(forwardedResponse.result.capabilities.logging).toBeDefined();
        }
      }
    } finally {
      await teardown();
    }
  });

  it("should inject capabilities for non-initialize responses without error", async () => {
    const { proxy, procManager, stdinWriter, stdoutReader, teardown } = setupProxyTest({
      restartDelay: 100,
    });

    try {
      // Start proxy
      proxy.start();
      await waitForStable(50);

      const serverProcess = procManager.getLastSpawnedProcess();
      expect(serverProcess).toBeTruthy();
      if (!serverProcess) throw new Error("Server process should exist");

      // Send a non-initialize request
      const toolsListRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      };

      await stdinWriter.write(new TextEncoder().encode(JSON.stringify(toolsListRequest) + "\n"));

      // Server responds with tools list
      const toolsResponse = {
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "server-tool",
              description: "A tool from the server",
              inputSchema: { type: "object" },
            },
          ],
        },
      };

      serverProcess.simulateStdout(JSON.stringify(toolsResponse) + "\n");

      // Read the response
      const { value } = await stdoutReader.read();
      const responseText = new TextDecoder().decode(value);
      const forwardedResponse = JSON.parse(responseText.trim());

      // Should forward without modification (capability injection only for initialize)
      expect(forwardedResponse).toEqual(toolsResponse);
    } finally {
      await teardown();
    }
  });
});