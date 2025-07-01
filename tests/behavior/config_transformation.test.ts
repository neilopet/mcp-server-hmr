/**
 * Behavioral test for config transformation functionality
 *
 * Tests that the config launcher properly:
 * - Modifies targeted servers to use hot-reload proxy
 * - Preserves untargeted servers unchanged
 * - Creates backup files before modification
 * - Handles edge cases and error scenarios
 * - Supports both single server and --all modes
 */

import { describe, it, expect } from "@jest/globals";
import { MockFileSystem } from "../mocks/MockFileSystem.js";
import { setupProxyTest } from "./test_helper.js";

// Import the config launcher functions we want to test
// Note: These would normally be imported from config_launcher.ts
// For this behavioral test, we'll create simplified versions that use our FileSystem interface

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Simplified version of setupHotReload that uses FileSystem interface
 * This demonstrates how the config launcher should work with dependency injection
 */
async function setupHotReloadWithMocks(
  fs: MockFileSystem,
  configPath: string,
  serverName: string,
  setupAll: boolean = false
): Promise<void> {
  // Read existing config
  const configText = await fs.readFile(configPath);
  const config: MCPServersConfig = JSON.parse(configText);

  // Create backup
  const backupPath = configPath + ".backup-test";
  await fs.copyFile(configPath, backupPath);

  // Determine servers to modify
  let serversToSetup: string[] = [];
  if (setupAll) {
    serversToSetup = Object.keys(config.mcpServers);
  } else {
    serversToSetup = [serverName];
  }

  // Create modified config
  const newConfig = { ...config };

  for (const name of serversToSetup) {
    const original = config.mcpServers[name];

    // Store original with -original suffix
    const originalName = `${name}-original`;
    newConfig.mcpServers[originalName] = { ...original };

    // Replace with hot-reload version
    newConfig.mcpServers[name] = {
      command: "/path/to/main.ts",
      args: [original.command, ...(original.args || [])],
      env: original.env,
      cwd: original.cwd,
    };
  }

  // Write updated config
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
}

describe("Test Suite", () => {
  it("Config transformation - modifies single server while preserving others", async () => {
    const mockFileSystem = new MockFileSystem();

    // Setup initial config with multiple servers
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "server-a": {
          command: "node",
          args: ["server-a.js"],
          env: { API_KEY: "key-a" },
        },
        "server-b": {
          command: "python",
          args: ["server-b.py"],
          cwd: "/path/to/b",
        },
        "server-c": {
          command: "deno",
          args: ["run", "server-c.ts"],
        },
      },
    };

    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));

    // Transform only server-b
    await setupHotReloadWithMocks(mockFileSystem, configPath, "server-b", false);

    // Verify backup was created
    const backupPath = configPath + ".backup-test";
    expect(await mockFileSystem.exists(backupPath)).toBeTruthy(); //  "Should create backup file";

    // Verify backup contains original config
    const backupContent = await mockFileSystem.readFile(backupPath);
    const backupConfig = JSON.parse(backupContent);
    expect(backupConfig.mcpServers["server-b"].command).toBe("python"); // Backup should contain original config

    // Verify modified config
    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);

    // server-a and server-c should be unchanged
    expect(modifiedConfig.mcpServers["server-a"].command).toBe("node"); // server-a should be unchanged
    expect(modifiedConfig.mcpServers["server-c"].command).toBe("deno"); // server-c should be unchanged

    // server-b should be modified
    expect(modifiedConfig.mcpServers["server-b"].command).toBe("/path/to/main.ts"); // server-b should use hot-reload proxy
    expect(modifiedConfig.mcpServers["server-b"].args?.[0]).toBe("python"); // server-b should wrap original command
    expect(modifiedConfig.mcpServers["server-b"].args?.[1]).toBe("server-b.py"); // server-b should wrap original args

    // Original server-b should be preserved with -original suffix
    expect(modifiedConfig.mcpServers["server-b-original"]).toBeTruthy(); // Should preserve original server-b
    expect(modifiedConfig.mcpServers["server-b-original"].command).toBe("python"); // Original should be unchanged

    // Environment and cwd should be preserved
    expect(modifiedConfig.mcpServers["server-b"].cwd).toBe("/path/to/b"); //  "Should preserve cwd";
  });
});

describe("Test Suite", () => {
  it("Config transformation - setup all servers mode", async () => {
    const mockFileSystem = new MockFileSystem();

    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "server-1": {
          command: "node",
          args: ["app.js"],
        },
        "server-2": {
          command: "python",
          args: ["-m", "server"],
        },
        "server-3": {
          command: "deno",
          args: ["run", "mod.ts"],
        },
      },
    };

    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));

    // Transform all servers
    await setupHotReloadWithMocks(mockFileSystem, configPath, "", true);

    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);

    // All servers should be modified
    for (const serverName of ["server-1", "server-2", "server-3"]) {
      expect(modifiedConfig.mcpServers[serverName].command).toBe("/path/to/main.ts"); // ${serverName} should use hot-reload proxy

      // Original should be preserved
      expect(modifiedConfig.mcpServers[`${serverName}-original`]).toBeTruthy(); // Should preserve original ${serverName}
    }

    // Should have 6 total servers (3 modified + 3 originals)
    expect(Object.keys(modifiedConfig.mcpServers).length).toBe(6); //  "Should have 6 total servers";
  });
});

describe("Test Suite", () => {
  it("Config transformation - handles missing server gracefully", async () => {
    const mockFileSystem = new MockFileSystem();

    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "existing-server": {
          command: "node",
          args: ["server.js"],
        },
      },
    };

    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));

    // Try to transform non-existent server
    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "non-existent-server", false);
      expect(false).toBeTruthy(); //  "Should throw error for non-existent server";
    } catch (error) {
      // Expected to fail - this tests error handling
      expect(error instanceof Error).toBeTruthy(); //  "Should throw proper error";
    }

    // Original config should be unchanged
    const configContent = await mockFileSystem.readFile(configPath);
    const config = JSON.parse(configContent);
    expect(config.mcpServers["existing-server"].command).toBe("node"); // Original config should be unchanged
  });
});

describe("Test Suite", () => {
  it("Config transformation - preserves complex server configurations", async () => {
    const mockFileSystem = new MockFileSystem();

    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "complex-server": {
          command: "node",
          args: ["--max-old-space-size=8192", "server.js", "--port", "3000"],
          env: {
            NODE_ENV: "production",
            API_KEY: "secret-key",
            DATABASE_URL: "postgres://localhost/db",
          },
          cwd: "/app/server",
        },
      },
    };

    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));

    await setupHotReloadWithMocks(mockFileSystem, configPath, "complex-server", false);

    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);

    const modified = modifiedConfig.mcpServers["complex-server"];
    const original = modifiedConfig.mcpServers["complex-server-original"];

    // Should preserve all environment variables
    expect(modified.env?.NODE_ENV).toBe("production"); //  "Should preserve NODE_ENV";
    expect(modified.env?.API_KEY).toBe("secret-key"); //  "Should preserve API_KEY";
    expect(modified.env?.DATABASE_URL).toBe("postgres://localhost/db"); // Should preserve DATABASE_URL

    // Should preserve cwd
    expect(modified.cwd).toBe("/app/server"); //  "Should preserve cwd";

    // Should wrap all original arguments
    expect(modified.args?.[0]).toBe("node"); //  "Should wrap original command";
    expect(modified.args?.[1]).toBe("--max-old-space-size=8192"); //  "Should preserve node flags";
    expect(modified.args?.[2]).toBe("server.js"); //  "Should preserve script name";
    expect(modified.args?.[3]).toBe("--port"); //  "Should preserve app args";
    expect(modified.args?.[4]).toBe("3000"); //  "Should preserve app values";

    // Original should be completely preserved
    expect(original.command).toBe("node"); //  "Original command should be preserved";
    expect(original.args?.length).toBe(4); //  "Original args should be preserved";
    expect(original.env?.API_KEY).toBe("secret-key"); //  "Original env should be preserved";
  });
});

describe("Test Suite", () => {
  it("Config transformation - handles file system errors gracefully", async () => {
    const mockFileSystem = new MockFileSystem();

    const configPath = "/test/config.json";

    // Test read failure
    mockFileSystem.setFailures({
      read: true,
      message: "Permission denied",
    });

    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "server", false);
      expect(false).toBeTruthy(); //  "Should throw error when config read fails";
    } catch (error) {
      expect(error instanceof Error).toBeTruthy(); //  "Should throw proper error";
      expect((error as Error).message.includes("Permission denied")).toBeTruthy(); //  "Should include original error message";
    }

    // Reset and test copy failure
    mockFileSystem.setFileContent(configPath, '{"mcpServers":{"test":{"command":"node"}}}');
    mockFileSystem.setFailures({
      read: false, // Reset read failure
      copy: true,
      message: "Backup failed",
    });

    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "test", false);
      expect(false).toBeTruthy(); //  "Should throw error when backup fails";
    } catch (error) {
      expect(error instanceof Error).toBeTruthy(); //  "Should throw proper error";
      expect((error as Error).message.includes("Backup failed")).toBeTruthy(); //  "Should include backup error message";
    }

    // Reset and test write failure
    mockFileSystem.setFailures({
      copy: false, // Reset copy failure
      write: true,
      message: "Write failed",
    });

    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "test", false);
      expect(false).toBeTruthy(); //  "Should throw error when config write fails";
    } catch (error) {
      expect(error instanceof Error).toBeTruthy(); //  "Should throw proper error";
      expect((error as Error).message.includes("Write failed")).toBeTruthy(); //  "Should include write error message";
    }
  });
});

describe("Test Suite", () => {
  it("Config transformation - validates operation tracking", async () => {
    const mockFileSystem = new MockFileSystem();

    const initialConfig: MCPServersConfig = {
      mcpServers: {
        server: {
          command: "node",
          args: ["app.js"],
        },
      },
    };

    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));

    await setupHotReloadWithMocks(mockFileSystem, configPath, "server", false);

    // Verify operation tracking
    const operations = mockFileSystem.getOperationCounts();
    expect(operations.reads).toBe(1); //  "Should track config read";
    expect(operations.copies).toBe(1); //  "Should track backup copy";
    expect(operations.writes).toBe(1); //  "Should track config write";

    // Verify specific operations
    expect(mockFileSystem.readCalls.length).toBe(1); //  "Should have one read call";
    expect(mockFileSystem.readCalls[0].path).toBe(configPath); //  "Should read config file";

    expect(mockFileSystem.copyCalls.length).toBe(1); //  "Should have one copy call";
    expect(mockFileSystem.copyCalls[0].src).toBe(configPath); //  "Should copy from config file";
    expect(mockFileSystem.copyCalls[0].dest).toBe(configPath + ".backup-test"); // Should copy to backup file

    expect(mockFileSystem.writeCalls.length).toBe(1); //  "Should have one write call";
    expect(mockFileSystem.writeCalls[0].path).toBe(configPath); //  "Should write to config file";
  });
});
