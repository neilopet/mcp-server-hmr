#!/usr/bin/env node
/**
 * Config-based launcher for MCP Server HMR (Node.js version)
 *
 * Reads from mcpServers.json format and launches the HMR proxy
 * with the appropriate configuration.
 *
 * Usage:
 *   mcp-hmr --server <server-name> [--config <path-to-config>]
 *   mcp-hmr -s <server-name> [-c <path-to-config>]
 */

import { Command } from "commander";
import { readFile, writeFile, access, copyFile } from "fs/promises";
import { resolve, join, dirname } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { NodeFileSystem } from "./node/NodeFileSystem.js";
import type { FileSystem } from "./interfaces.js";

// Get current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

// Check if a server uses stdio transport (not SSE or HTTP)
function isStdioServer(serverConfig: MCPServerConfig): boolean {
  // Check for explicit transport specification
  if ("transport" in serverConfig) {
    return (serverConfig as any).transport === "stdio";
  }

  // Check for SSE/HTTP indicators
  const command = serverConfig.command.toLowerCase();
  const args = (serverConfig.args || []).join(" ").toLowerCase();
  const fullCommand = `${command} ${args}`;

  // Common SSE/HTTP server indicators
  if (
    fullCommand.includes("--port") ||
    fullCommand.includes("--http") ||
    fullCommand.includes("--sse") ||
    fullCommand.includes("server.listen") ||
    fullCommand.includes("express") ||
    fullCommand.includes("fastify")
  ) {
    return false;
  }

  // Docker containers often use stdio
  if (command === "docker" && args.includes("-i")) {
    return true;
  }

  // Default to stdio for most servers
  return true;
}

// Helper function to find config file
async function findConfigFile(fs: FileSystem, providedPath?: string): Promise<string | null> {
  // If path is provided, use it directly
  if (providedPath) {
    const resolvedPath = resolve(providedPath);
    if (await fs.exists(resolvedPath)) {
      return resolvedPath;
    }
    console.error(`❌ Config file not found: ${resolvedPath}`);
    return null;
  }

  // Search in default locations
  const searchPaths = [];

  // 1. Claude Code project config
  const projectMcpPath = resolve(".mcp.json");
  searchPaths.push(projectMcpPath);

  // 2. Claude Desktop config (platform-specific)
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (process.platform === "darwin") {
    searchPaths.push(
      resolve(home, "Library/Application Support/Claude/claude_desktop_config.json"),
    );
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      searchPaths.push(resolve(appData, "Claude/claude_desktop_config.json"));
    }
  } else if (process.platform === "linux") {
    searchPaths.push(resolve(home, ".config/Claude/claude_desktop_config.json"));
  }

  // 3. Current directory mcpServers.json
  searchPaths.push(resolve("./mcpServers.json"));

  // Check each path
  for (const path of searchPaths) {
    if (await fs.exists(path)) {
      console.log(`📋 Found config at: ${path}`);
      return path;
    }
  }

  return null;
}

// Setup hot-reload for selected servers
async function setupHotReload(
  fs: FileSystem,
  config: MCPServersConfig,
  configPath: string,
  serverName: string | boolean,
  setupAll: boolean,
) {
  console.log(`🔧 Setting up hot-reload proxy...`);
  console.log(`📋 Config: ${configPath}`);

  // Create backup
  const backupPath = configPath + ".backup-" + new Date().toISOString().replace(/[:.]/g, "-");
  try {
    await copyFile(configPath, backupPath);
    console.log(`💾 Backup created: ${backupPath}`);
  } catch (error) {
    console.error(`❌ Failed to create backup: ${(error as Error).message}`);
    process.exit(1);
  }

  // Determine which servers to setup
  let serversToSetup: string[] = [];

  if (setupAll) {
    // Setup all stdio servers
    serversToSetup = Object.entries(config.mcpServers)
      .filter(([_, cfg]) => isStdioServer(cfg))
      .map(([name]) => name);

    if (serversToSetup.length === 0) {
      console.error(`❌ No stdio servers found to setup`);
      process.exit(1);
    }

    console.log(`\n📦 Found ${serversToSetup.length} stdio servers to setup:`);
    serversToSetup.forEach((name) => console.log(`   - ${name}`));
  } else if (typeof serverName === "string" && serverName) {
    // Setup specific server
    if (!config.mcpServers[serverName]) {
      console.error(`❌ Server '${serverName}' not found in config`);
      process.exit(1);
    }

    if (!isStdioServer(config.mcpServers[serverName])) {
      console.error(`❌ Server '${serverName}' appears to use HTTP/SSE transport, not stdio`);
      console.error(`   Hot-reload proxy only supports stdio servers`);
      process.exit(1);
    }

    serversToSetup = [serverName];
  } else {
    console.error(`❌ Please specify a server name or use --all`);
    process.exit(1);
  }

  // Get the absolute path to our tools
  const cliPath = resolve(__dirname, "../dist/cli.js");
  
  // Replace each server with hot-reload version
  const newConfig = { ...config };
  const modifiedServers: string[] = [];

  for (const name of serversToSetup) {
    const original = config.mcpServers[name];

    // Store original config with -original suffix
    const originalName = `${name}-original`;
    newConfig.mcpServers[originalName] = { ...original };

    // Replace with hot-reload version
    newConfig.mcpServers[name] = {
      command: "node",
      args: [cliPath, "--server", name, "--config", configPath],
      env: original.env,
      cwd: original.cwd,
    };

    modifiedServers.push(name);
  }

  // Write updated config
  try {
    const configText = JSON.stringify(newConfig, null, 2);
    await writeFile(configPath, configText, "utf-8");
    console.log(`\n✅ Updated config file: ${configPath}`);
    console.log(`\n📝 Hot-reload configured for ${serversToSetup.length} server(s):`);
    for (const serverName of serversToSetup) {
      console.log(`   - ${serverName} → ${cliPath}`);
    }
    console.log(
      `\n⚠️  Important: Restart your MCP client (Claude Desktop, etc.) to load the new configuration.`,
    );
  } catch (error) {
    console.error(`❌ Failed to write config: ${(error as Error).message}`);
    process.exit(1);
  }

  // Show summary
  console.log(`\n🎉 Successfully configured ${modifiedServers.length} server(s) for hot-reload:`);
  modifiedServers.forEach((name) => {
    console.log(`\n   📦 ${name}`);
    console.log(`      Original: ${name}-original (preserved)`);
    console.log(`      Hot-reload: ${name} (active)`);
  });

  console.log(`\n💡 To restore original configuration:`);
  console.log(`   cp "${backupPath}" "${configPath}"`);

  if (configPath.includes("claude_desktop_config.json")) {
    console.log(`\n⚠️  Restart Claude Desktop to apply changes`);
  } else if (configPath.includes(".mcp.json")) {
    console.log(`\n⚠️  Restart Claude Code or reload the project`);
  }
}

// Create the command program
const program = new Command();

program
  .name("mcp-hmr")
  .description("MCP Server Hot-Reload - Hot-reload for MCP servers")
  .version("0.1.0");

program
  .option("-s, --server <name>", "Name of the server to proxy from config")
  .option("-c, --config <path>", "Path to config file")
  .option("-l, --list", "List available servers in the config")
  .option("--setup [name]", "Configure server(s) to use hot-reload proxy")
  .option("--all", "Setup all stdio servers (with --setup)")
  .helpOption("-h, --help", "Show this help message");

// Custom help text
program.addHelpText('after', `
Default Config Search Order:
  1. .mcp.json (Claude Code project config)
  2. ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
     %APPDATA%\\Claude\\claude_desktop_config.json (Windows)
     ~/.config/Claude/claude_desktop_config.json (Linux)
  3. ./mcpServers.json (current directory)

Examples:
  mcp-hmr --server my-server
  mcp-hmr -s my-server -c ~/mcp-config.json
  mcp-hmr --list
  mcp-hmr --setup my-server     # Configure my-server to use hot-reload
  mcp-hmr --setup --all         # Configure all stdio servers

The config file should be in the standard MCP servers format:
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "API_KEY": "..." }
    }
  }
}
`);

// Main action
program.action(async (options) => {
  // Create FileSystem instance
  const fs = new NodeFileSystem();

  // Find and load config file
  const configPath = await findConfigFile(fs, options.config);
  if (!configPath) {
    console.error(`\n❌ No config file found!`);
    console.error(`\nSearched in:`);
    console.error(`  1. .mcp.json (Claude Code project config)`);
    if (process.platform === "darwin") {
      console.error(`  2. ~/Library/Application Support/Claude/claude_desktop_config.json`);
    } else if (process.platform === "win32") {
      console.error(`  2. %APPDATA%\\Claude\\claude_desktop_config.json`);
    } else {
      console.error(`  2. ~/.config/Claude/claude_desktop_config.json`);
    }
    console.error(`  3. ./mcpServers.json`);
    console.error(`\nYou can specify a custom path with --config <path>`);
    process.exit(1);
  }

  let config: MCPServersConfig;
  try {
    const configText = await readFile(configPath, "utf-8");
    config = JSON.parse(configText);
  } catch (error) {
    console.error(`❌ Failed to read config file: ${(error as Error).message}`);
    process.exit(1);
  }

  // Validate config structure
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    console.error(`❌ Invalid config format: missing or invalid 'mcpServers' object`);
    console.error(
      `\nExpected format: { "mcpServers": { "name": { "command": "...", "args": [...] } } }`,
    );
    process.exit(1);
  }

  // Setup mode - configure servers to use hot-reload proxy
  if (options.setup !== undefined || options.all) {
    await setupHotReload(fs, config, configPath, options.setup, options.all);
    process.exit(0);
  }

  // List servers if requested
  if (options.list) {
    const serverNames = Object.keys(config.mcpServers);
    if (serverNames.length === 0) {
      console.log("No servers found in config file");
    } else {
      console.log(`Available servers in ${configPath}:\n`);
      for (const name of serverNames) {
        const server = config.mcpServers[name];
        console.log(`  📦 ${name}`);
        console.log(`     Command: ${server.command} ${(server.args || []).join(" ")}`);
        if (server.cwd) console.log(`     Working Dir: ${server.cwd}`);
        if (server.env) console.log(`     Env Vars: ${Object.keys(server.env).join(", ")}`);
        console.log();
      }
    }
    process.exit(0);
  }

  // Server mode - run hot-reload proxy
  if (options.server) {
    const serverName = options.server;
    const serverConfig = config.mcpServers[serverName];

    if (!serverConfig) {
      console.error(`❌ Server '${serverName}' not found in config`);
      console.error(`\nAvailable servers: ${Object.keys(config.mcpServers).join(", ")}`);
      console.error(`\nUse --list to see full details`);
      process.exit(1);
    }

    // Validate server config
    if (!serverConfig.command) {
      console.error(`❌ Server '${serverName}' is missing required 'command' field`);
      process.exit(1);
    }

    // Prepare environment variables for the HMR proxy
    const hmrEnv: Record<string, string> = {
      ...process.env, // Include current environment
      ...serverConfig.env, // Include server-specific env vars
      MCP_SERVER_COMMAND: serverConfig.command,
      MCP_SERVER_ARGS: (serverConfig.args || []).join(" "),
    };

    // Determine what file to watch based on the command and args
    let watchFile: string | undefined;
    if (serverConfig.args && serverConfig.args.length > 0) {
      // Try to extract the main file from args
      const firstArg = serverConfig.args[0];

      // For Node.js servers
      if (serverConfig.command === "node" && firstArg) {
        watchFile = resolve(serverConfig.cwd || ".", firstArg);
      } // For Deno servers
      else if (serverConfig.command === "deno" && serverConfig.args.includes("run")) {
        const runIndex = serverConfig.args.indexOf("run");
        for (let i = runIndex + 1; i < serverConfig.args.length; i++) {
          if (!serverConfig.args[i].startsWith("-")) {
            watchFile = resolve(serverConfig.cwd || ".", serverConfig.args[i]);
            break;
          }
        }
      } // For Python servers
      else if ((serverConfig.command === "python" || serverConfig.command === "python3") && firstArg) {
        watchFile = resolve(serverConfig.cwd || ".", firstArg);
      }
    }

    if (watchFile) {
      hmrEnv.MCP_WATCH_FILE = watchFile;
    }

    // Log what we're about to do
    console.log(`🚀 Starting MCP Server HMR for '${serverName}'`);
    console.log(`📋 Config: ${configPath}`);

    // Show source of config
    if (configPath.endsWith(".mcp.json")) {
      console.log(`📍 Source: Claude Code project config`);
    } else if (configPath.includes("Claude/claude_desktop_config.json")) {
      console.log(`📍 Source: Claude Desktop config`);
    } else {
      console.log(`📍 Source: Custom config file`);
    }

    console.log(`📟 Command: ${serverConfig.command} ${(serverConfig.args || []).join(" ")}`);
    if (serverConfig.cwd) console.log(`📁 Working Directory: ${serverConfig.cwd}`);
    if (watchFile) console.log(`👀 Watching: ${watchFile}`);
    console.log();

    // Import MCPProxy and start it
    const { MCPProxy } = await import("./proxy.js");
    const { NodeProcessManager } = await import("./node/NodeProcessManager.js");
    
    const procManager = new NodeProcessManager();
    const proxyDependencies = {
      procManager,
      fs,
      stdin: new ReadableStream({
        start(controller) {
          process.stdin.on("data", (chunk) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          process.stdin.on("end", () => {
            controller.close();
          });
        },
      }),
      stdout: new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            process.stdout.write(chunk, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
      }),
      stderr: new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            process.stderr.write(chunk, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
      }),
      exit: (code: number) => process.exit(code),
    };

    const proxyConfig = {
      command: serverConfig.command,
      commandArgs: serverConfig.args || [],
      entryFile: watchFile || null,
      restartDelay: 1000,
      env: serverConfig.env,
      killDelay: 1000,
      readyDelay: 2000,
    };

    const proxy = new MCPProxy(proxyDependencies, proxyConfig);
    await proxy.start();
  } else {
    // No specific action, show help
    program.help();
  }
});

// Parse command line arguments
program.parse();