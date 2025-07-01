#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run
/**
 * Config-based launcher for MCP Server HMR
 *
 * Reads from mcpServers.json format and launches the HMR proxy
 * with the appropriate configuration.
 *
 * Usage:
 *   mcp-hmr --server <server-name> [--config <path-to-config>]
 *   mcp-hmr -s <server-name> [-c <path-to-config>]
 */

import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";
import { join, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/mod.ts";

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

// Parse command line arguments
const args = parse(Deno.args, {
  string: ["server", "config", "s", "c"],
  boolean: ["help", "h", "list", "l"],
  alias: {
    server: "s",
    config: "c",
    help: "h",
    list: "l"
  },
  default: {
    config: "./mcpServers.json"
  }
});

// Show help
if (args.help || (!args.server && !args.list)) {
  console.log(`MCP Server HMR - Config Launcher

Usage:
  mcp-hmr --server <server-name> [--config <path>]
  mcp-hmr -s <server-name> [-c <path>]
  mcp-hmr --list [--config <path>]
  mcp-hmr --help

Options:
  -s, --server <name>    Name of the server to proxy from mcpServers.json
  -c, --config <path>    Path to config file (default: ./mcpServers.json)
  -l, --list             List available servers in the config
  -h, --help             Show this help message

Examples:
  mcp-hmr --server channelape
  mcp-hmr -s my-server -c ~/mcp-config.json
  mcp-hmr --list

The config file should be in the standard MCP servers format:
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "API_KEY": "..." }
    }
  }
}`);
  Deno.exit(0);
}

// Load config file
const configPath = resolve(args.config as string);
if (!existsSync(configPath)) {
  console.error(`❌ Config file not found: ${configPath}`);
  console.error(`\nTry creating a mcpServers.json file or specify a different path with --config`);
  Deno.exit(1);
}

let config: MCPServersConfig;
try {
  const configText = await Deno.readTextFile(configPath);
  config = JSON.parse(configText);
} catch (error) {
  console.error(`❌ Failed to read config file: ${error.message}`);
  Deno.exit(1);
}

// Validate config structure
if (!config.mcpServers || typeof config.mcpServers !== "object") {
  console.error(`❌ Invalid config format: missing or invalid 'mcpServers' object`);
  console.error(`\nExpected format: { "mcpServers": { "name": { "command": "...", "args": [...] } } }`);
  Deno.exit(1);
}

// List servers if requested
if (args.list) {
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
  Deno.exit(0);
}

// Get the specified server config
const serverName = args.server as string;
const serverConfig = config.mcpServers[serverName];

if (!serverConfig) {
  console.error(`❌ Server '${serverName}' not found in config`);
  console.error(`\nAvailable servers: ${Object.keys(config.mcpServers).join(", ")}`);
  console.error(`\nUse --list to see full details`);
  Deno.exit(1);
}

// Validate server config
if (!serverConfig.command) {
  console.error(`❌ Server '${serverName}' is missing required 'command' field`);
  Deno.exit(1);
}

// Prepare environment variables for the HMR proxy
const hmrEnv: Record<string, string> = {
  ...Deno.env.toObject(),  // Include current environment
  ...serverConfig.env,      // Include server-specific env vars
  MCP_SERVER_COMMAND: serverConfig.command,
  MCP_SERVER_ARGS: (serverConfig.args || []).join(" ")
};

// Determine what file to watch based on the command and args
let watchFile: string | undefined;
if (serverConfig.args && serverConfig.args.length > 0) {
  // Try to extract the main file from args
  const firstArg = serverConfig.args[0];

  // For Node.js servers
  if (serverConfig.command === "node" && firstArg) {
    watchFile = resolve(serverConfig.cwd || ".", firstArg);
  }
  // For Deno servers
  else if (serverConfig.command === "deno" && serverConfig.args.includes("run")) {
    const runIndex = serverConfig.args.indexOf("run");
    for (let i = runIndex + 1; i < serverConfig.args.length; i++) {
      if (!serverConfig.args[i].startsWith("-")) {
        watchFile = resolve(serverConfig.cwd || ".", serverConfig.args[i]);
        break;
      }
    }
  }
  // For Python servers
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
console.log(`📟 Command: ${serverConfig.command} ${(serverConfig.args || []).join(" ")}`);
if (serverConfig.cwd) console.log(`📁 Working Directory: ${serverConfig.cwd}`);
if (watchFile) console.log(`👀 Watching: ${watchFile}`);
console.log();

// Find the main.ts file relative to this script
const mainPath = join(new URL(".", import.meta.url).pathname, "main.ts");

// Launch the HMR proxy with the extracted configuration
const hmrProcess = new Deno.Command("deno", {
  args: [
    "run",
    "--allow-env",
    "--allow-read",
    "--allow-run",
    mainPath
  ],
  env: hmrEnv,
  cwd: serverConfig.cwd,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
}).spawn();

// Wait for the process to complete
const status = await hmrProcess.status;
Deno.exit(status.code);
