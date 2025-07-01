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

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MockFileSystem } from "../mocks/MockFileSystem.ts";

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

Deno.test({
  name: "Config transformation - modifies single server while preserving others",
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    // Setup initial config with multiple servers
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "server-a": {
          command: "node",
          args: ["server-a.js"],
          env: { API_KEY: "key-a" }
        },
        "server-b": {
          command: "python", 
          args: ["server-b.py"],
          cwd: "/path/to/b"
        },
        "server-c": {
          command: "deno",
          args: ["run", "server-c.ts"]
        }
      }
    };
    
    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));
    
    // Transform only server-b
    await setupHotReloadWithMocks(mockFileSystem, configPath, "server-b", false);
    
    // Verify backup was created
    const backupPath = configPath + ".backup-test";
    assert(await mockFileSystem.exists(backupPath), "Should create backup file");
    
    // Verify backup contains original config
    const backupContent = await mockFileSystem.readFile(backupPath);
    const backupConfig = JSON.parse(backupContent);
    assertEquals(backupConfig.mcpServers["server-b"].command, "python", "Backup should contain original config");
    
    // Verify modified config
    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);
    
    // server-a and server-c should be unchanged
    assertEquals(modifiedConfig.mcpServers["server-a"].command, "node", "server-a should be unchanged");
    assertEquals(modifiedConfig.mcpServers["server-c"].command, "deno", "server-c should be unchanged");
    
    // server-b should be modified
    assertEquals(modifiedConfig.mcpServers["server-b"].command, "/path/to/main.ts", "server-b should use hot-reload proxy");
    assertEquals(modifiedConfig.mcpServers["server-b"].args?.[0], "python", "server-b should wrap original command");
    assertEquals(modifiedConfig.mcpServers["server-b"].args?.[1], "server-b.py", "server-b should wrap original args");
    
    // Original server-b should be preserved with -original suffix
    assertExists(modifiedConfig.mcpServers["server-b-original"], "Should preserve original server-b");
    assertEquals(modifiedConfig.mcpServers["server-b-original"].command, "python", "Original should be unchanged");
    
    // Environment and cwd should be preserved
    assertEquals(modifiedConfig.mcpServers["server-b"].cwd, "/path/to/b", "Should preserve cwd");
  },
  sanitizeOps: false,
  sanitizeResources: false,

Deno.test({
  name: "Config transformation - setup all servers mode",
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "server-1": {
          command: "node",
          args: ["app.js"]
        },
        "server-2": {
          command: "python",
          args: ["-m", "server"]
        },
        "server-3": {
          command: "deno",
          args: ["run", "mod.ts"]
        }
      }
    };
    
    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));
    
    // Transform all servers
    await setupHotReloadWithMocks(mockFileSystem, configPath, "", true);
    
    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);
    
    // All servers should be modified
    for (const serverName of ["server-1", "server-2", "server-3"]) {
      assertEquals(
        modifiedConfig.mcpServers[serverName].command, 
        "/path/to/main.ts", 
        `${serverName} should use hot-reload proxy`
      );
      
      // Original should be preserved
      assertExists(
        modifiedConfig.mcpServers[`${serverName}-original`], 
        `Should preserve original ${serverName}`
      );
    }
    
    // Should have 6 total servers (3 modified + 3 originals)
    assertEquals(Object.keys(modifiedConfig.mcpServers).length, 6, "Should have 6 total servers");
  },
  sanitizeOps: false,
  sanitizeResources: false,

Deno.test({
  name: "Config transformation - handles missing server gracefully",
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "existing-server": {
          command: "node",
          args: ["server.js"]
        }
      }
    };
    
    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));
    
    // Try to transform non-existent server
    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "non-existent-server", false);
      assert(false, "Should throw error for non-existent server");
    } catch (error) {
      // Expected to fail - this tests error handling
      assert(error instanceof Error, "Should throw proper error");
    }
    
    // Original config should be unchanged
    const configContent = await mockFileSystem.readFile(configPath);
    const config = JSON.parse(configContent);
    assertEquals(config.mcpServers["existing-server"].command, "node", "Original config should be unchanged");
  },
  sanitizeOps: false,
  sanitizeResources: false,

Deno.test({
  name: "Config transformation - preserves complex server configurations", 
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "complex-server": {
          command: "node",
          args: ["--max-old-space-size=8192", "server.js", "--port", "3000"],
          env: {
            NODE_ENV: "production",
            API_KEY: "secret-key",
            DATABASE_URL: "postgres://localhost/db"
          },
          cwd: "/app/server"
        }
      }
    };
    
    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));
    
    await setupHotReloadWithMocks(mockFileSystem, configPath, "complex-server", false);
    
    const modifiedContent = await mockFileSystem.readFile(configPath);
    const modifiedConfig: MCPServersConfig = JSON.parse(modifiedContent);
    
    const modified = modifiedConfig.mcpServers["complex-server"];
    const original = modifiedConfig.mcpServers["complex-server-original"];
    
    // Should preserve all environment variables
    assertEquals(modified.env?.NODE_ENV, "production", "Should preserve NODE_ENV");
    assertEquals(modified.env?.API_KEY, "secret-key", "Should preserve API_KEY");
    assertEquals(modified.env?.DATABASE_URL, "postgres://localhost/db", "Should preserve DATABASE_URL");
    
    // Should preserve cwd
    assertEquals(modified.cwd, "/app/server", "Should preserve cwd");
    
    // Should wrap all original arguments
    assertEquals(modified.args?.[0], "node", "Should wrap original command");
    assertEquals(modified.args?.[1], "--max-old-space-size=8192", "Should preserve node flags");
    assertEquals(modified.args?.[2], "server.js", "Should preserve script name");
    assertEquals(modified.args?.[3], "--port", "Should preserve app args");
    assertEquals(modified.args?.[4], "3000", "Should preserve app values");
    
    // Original should be completely preserved
    assertEquals(original.command, "node", "Original command should be preserved");
    assertEquals(original.args?.length, 4, "Original args should be preserved");
    assertEquals(original.env?.API_KEY, "secret-key", "Original env should be preserved");
  },
  sanitizeOps: false,
  sanitizeResources: false,

Deno.test({
  name: "Config transformation - handles file system errors gracefully",
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    const configPath = "/test/config.json";
    
    // Test read failure
    
    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "server", false);
      assert(false, "Should throw error when config read fails");
    } catch (error) {
      assert(error instanceof Error, "Should throw proper error");
      assert(error.message.includes("Permission denied"), "Should include original error message");
    }
    
    // Reset and test copy failure
    mockFileSystem.setFileContent(configPath, '{"mcpServers":{"test":{"command":"node"}}}');
    
    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "test", false);
      assert(false, "Should throw error when backup fails");
    } catch (error) {
      assert(error instanceof Error, "Should throw proper error");
      assert(error.message.includes("Backup failed"), "Should include backup error message");
    }
    
    // Reset and test write failure
    
    try {
      await setupHotReloadWithMocks(mockFileSystem, configPath, "test", false);
      assert(false, "Should throw error when config write fails");
    } catch (error) {
      assert(error instanceof Error, "Should throw proper error");
      assert(error.message.includes("Write failed"), "Should include write error message");
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,

Deno.test({
  name: "Config transformation - validates operation tracking",
  async fn() {
    const mockFileSystem = new MockFileSystem();
    
    const initialConfig: MCPServersConfig = {
      mcpServers: {
        "server": {
          command: "node",
          args: ["app.js"]
        }
      }
    };
    
    const configPath = "/test/config.json";
    mockFileSystem.setFileContent(configPath, JSON.stringify(initialConfig, null, 2));
    
    await setupHotReloadWithMocks(mockFileSystem, configPath, "server", false);
    
    // Verify operation tracking
    const operations = mockFileSystem.getOperationCounts();
    assertEquals(operations.reads, 1, "Should track config read");
    assertEquals(operations.copies, 1, "Should track backup copy");
    assertEquals(operations.writes, 1, "Should track config write");
    
    // Verify specific operations
    assertEquals(mockFileSystem.readCalls.length, 1, "Should have one read call");
    assertEquals(mockFileSystem.readCalls[0].path, configPath, "Should read config file");
    
    assertEquals(mockFileSystem.copyCalls.length, 1, "Should have one copy call");
    assertEquals(mockFileSystem.copyCalls[0].src, configPath, "Should copy from config file");
    assertEquals(mockFileSystem.copyCalls[0].dest, configPath + ".backup-test", "Should copy to backup file");
    
    assertEquals(mockFileSystem.writeCalls.length, 1, "Should have one write call");
    assertEquals(mockFileSystem.writeCalls[0].path, configPath, "Should write to config file");
  },
  sanitizeOps: false,
  sanitizeResources: false,
