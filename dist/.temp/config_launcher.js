#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mod_ts_1 = require("https://deno.land/std@0.224.0/flags/mod.ts");
const mod_ts_2 = require("https://deno.land/std@0.224.0/path/mod.ts");
const mod_ts_3 = require("https://deno.land/std@0.224.0/fs/mod.ts");
function isStdioServer(serverConfig) {
    if ('transport' in serverConfig) {
        return serverConfig.transport === 'stdio';
    }
    const command = serverConfig.command.toLowerCase();
    const args = (serverConfig.args || []).join(' ').toLowerCase();
    const fullCommand = `${command} ${args}`;
    if (fullCommand.includes('--port') ||
        fullCommand.includes('--http') ||
        fullCommand.includes('--sse') ||
        fullCommand.includes('server.listen') ||
        fullCommand.includes('express') ||
        fullCommand.includes('fastify')) {
        return false;
    }
    if (command === 'docker' && args.includes('-i')) {
        return true;
    }
    return true;
}
async function setupHotReload(config, configPath, serverName, setupAll) {
    console.log(`🔧 Setting up hot-reload proxy...`);
    console.log(`📋 Config: ${configPath}`);
    const backupPath = configPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    try {
        await Deno.copyFile(configPath, backupPath);
        console.log(`💾 Backup created: ${backupPath}`);
    }
    catch (error) {
        console.error(`❌ Failed to create backup: ${error.message}`);
        Deno.exit(1);
    }
    let serversToSetup = [];
    if (setupAll) {
        serversToSetup = Object.entries(config.mcpServers)
            .filter(([_, cfg]) => isStdioServer(cfg))
            .map(([name]) => name);
        if (serversToSetup.length === 0) {
            console.error(`❌ No stdio servers found to setup`);
            Deno.exit(1);
        }
        console.log(`\n📦 Found ${serversToSetup.length} stdio servers to setup:`);
        serversToSetup.forEach(name => console.log(`   - ${name}`));
    }
    else if (typeof serverName === 'string' && serverName) {
        if (!config.mcpServers[serverName]) {
            console.error(`❌ Server '${serverName}' not found in config`);
            Deno.exit(1);
        }
        if (!isStdioServer(config.mcpServers[serverName])) {
            console.error(`❌ Server '${serverName}' appears to use HTTP/SSE transport, not stdio`);
            console.error(`   Hot-reload proxy only supports stdio servers`);
            Deno.exit(1);
        }
        serversToSetup = [serverName];
    }
    else {
        console.error(`❌ Please specify a server name or use --all`);
        Deno.exit(1);
    }
    const scriptDir = new URL(".", import.meta.url).pathname;
    const mainPath = (0, mod_ts_2.resolve)(scriptDir, "main.ts");
    const configLauncherPath = (0, mod_ts_2.resolve)(scriptDir, "config_launcher.ts");
    const newConfig = { ...config };
    const modifiedServers = [];
    for (const name of serversToSetup) {
        const original = config.mcpServers[name];
        const originalName = `${name}-original`;
        newConfig.mcpServers[originalName] = { ...original };
        newConfig.mcpServers[name] = {
            command: mainPath,
            args: [original.command, ...(original.args || [])],
            env: original.env,
            cwd: original.cwd
        };
        modifiedServers.push(name);
    }
    try {
        const configText = JSON.stringify(newConfig, null, 2);
        await Deno.writeTextFile(configPath, configText);
        console.log(`\n✅ Updated config file: ${configPath}`);
    }
    catch (error) {
        console.error(`❌ Failed to write config: ${error.message}`);
        Deno.exit(1);
    }
    console.log(`\n🎉 Successfully configured ${modifiedServers.length} server(s) for hot-reload:`);
    modifiedServers.forEach(name => {
        console.log(`\n   📦 ${name}`);
        console.log(`      Original: ${name}-original (preserved)`);
        console.log(`      Hot-reload: ${name} (active)`);
    });
    console.log(`\n💡 To restore original configuration:`);
    console.log(`   cp "${backupPath}" "${configPath}"`);
    if (configPath.includes('claude_desktop_config.json')) {
        console.log(`\n⚠️  Restart Claude Desktop to apply changes`);
    }
    else if (configPath.includes('.mcp.json')) {
        console.log(`\n⚠️  Restart Claude Code or reload the project`);
    }
}
const args = (0, mod_ts_1.parse)(Deno.args, {
    string: ["server", "config", "s", "c", "setup"],
    boolean: ["help", "h", "list", "l", "all"],
    alias: {
        server: "s",
        config: "c",
        help: "h",
        list: "l"
    }
});
function findConfigFile(providedPath) {
    if (providedPath) {
        const resolvedPath = (0, mod_ts_2.resolve)(providedPath);
        if ((0, mod_ts_3.existsSync)(resolvedPath)) {
            return resolvedPath;
        }
        console.error(`❌ Config file not found: ${resolvedPath}`);
        return null;
    }
    const searchPaths = [];
    const projectMcpPath = (0, mod_ts_2.resolve)(".mcp.json");
    searchPaths.push(projectMcpPath);
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    if (Deno.build.os === "darwin") {
        searchPaths.push((0, mod_ts_2.resolve)(home, "Library/Application Support/Claude/claude_desktop_config.json"));
    }
    else if (Deno.build.os === "windows") {
        const appData = Deno.env.get("APPDATA");
        if (appData) {
            searchPaths.push((0, mod_ts_2.resolve)(appData, "Claude/claude_desktop_config.json"));
        }
    }
    else if (Deno.build.os === "linux") {
        searchPaths.push((0, mod_ts_2.resolve)(home, ".config/Claude/claude_desktop_config.json"));
    }
    searchPaths.push((0, mod_ts_2.resolve)("./mcpServers.json"));
    for (const path of searchPaths) {
        if ((0, mod_ts_3.existsSync)(path)) {
            console.log(`📋 Found config at: ${path}`);
            return path;
        }
    }
    return null;
}
if (args.help || (!args.server && !args.list && !args.setup && !args.all)) {
    console.log(`MCP Server Watch - Hot-reload for MCP servers

Usage:
  watch --server <server-name> [--config <path>]
  watch -s <server-name> [-c <path>]
  watch --list [--config <path>]
  watch --setup [<server-name>] [--all] [--config <path>]
  watch --help

Options:
  -s, --server <name>    Name of the server to proxy from config
  -c, --config <path>    Path to config file (see below for defaults)
  -l, --list             List available servers in the config
  --setup [name]         Configure server(s) to use hot-reload proxy
  --all                  Setup all stdio servers (with --setup)
  -h, --help             Show this help message

Default Config Search Order:
  1. .mcp.json (Claude Code project config)
  2. ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
     %APPDATA%\Claude\claude_desktop_config.json (Windows)
     ~/.config/Claude/claude_desktop_config.json (Linux)
  3. ./mcpServers.json (current directory)

Examples:
  watch --server channelape
  watch -s my-server -c ~/mcp-config.json
  watch --list
  watch --setup channelape    # Configure channelape to use hot-reload
  watch --setup --all         # Configure all stdio servers

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
const configPath = findConfigFile(args.config);
if (!configPath) {
    console.error(`\n❌ No config file found!`);
    console.error(`\nSearched in:`);
    console.error(`  1. .mcp.json (Claude Code project config)`);
    if (Deno.build.os === "darwin") {
        console.error(`  2. ~/Library/Application Support/Claude/claude_desktop_config.json`);
    }
    else if (Deno.build.os === "windows") {
        console.error(`  2. %APPDATA%\\Claude\\claude_desktop_config.json`);
    }
    else {
        console.error(`  2. ~/.config/Claude/claude_desktop_config.json`);
    }
    console.error(`  3. ./mcpServers.json`);
    console.error(`\nYou can specify a custom path with --config <path>`);
    Deno.exit(1);
}
let config;
try {
    const configText = await Deno.readTextFile(configPath);
    config = JSON.parse(configText);
}
catch (error) {
    console.error(`❌ Failed to read config file: ${error.message}`);
    Deno.exit(1);
}
if (!config.mcpServers || typeof config.mcpServers !== "object") {
    console.error(`❌ Invalid config format: missing or invalid 'mcpServers' object`);
    console.error(`\nExpected format: { "mcpServers": { "name": { "command": "...", "args": [...] } } }`);
    Deno.exit(1);
}
if (args.setup !== undefined || args.all) {
    await setupHotReload(config, configPath, args.setup, args.all);
    Deno.exit(0);
}
if (args.list) {
    const serverNames = Object.keys(config.mcpServers);
    if (serverNames.length === 0) {
        console.log("No servers found in config file");
    }
    else {
        console.log(`Available servers in ${configPath}:\n`);
        for (const name of serverNames) {
            const server = config.mcpServers[name];
            console.log(`  📦 ${name}`);
            console.log(`     Command: ${server.command} ${(server.args || []).join(" ")}`);
            if (server.cwd)
                console.log(`     Working Dir: ${server.cwd}`);
            if (server.env)
                console.log(`     Env Vars: ${Object.keys(server.env).join(", ")}`);
            console.log();
        }
    }
    Deno.exit(0);
}
const serverName = args.server;
const serverConfig = config.mcpServers[serverName];
if (!serverConfig) {
    console.error(`❌ Server '${serverName}' not found in config`);
    console.error(`\nAvailable servers: ${Object.keys(config.mcpServers).join(", ")}`);
    console.error(`\nUse --list to see full details`);
    Deno.exit(1);
}
if (!serverConfig.command) {
    console.error(`❌ Server '${serverName}' is missing required 'command' field`);
    Deno.exit(1);
}
const hmrEnv = {
    ...Deno.env.toObject(),
    ...serverConfig.env,
    MCP_SERVER_COMMAND: serverConfig.command,
    MCP_SERVER_ARGS: (serverConfig.args || []).join(" ")
};
let watchFile;
if (serverConfig.args && serverConfig.args.length > 0) {
    const firstArg = serverConfig.args[0];
    if (serverConfig.command === "node" && firstArg) {
        watchFile = (0, mod_ts_2.resolve)(serverConfig.cwd || ".", firstArg);
    }
    else if (serverConfig.command === "deno" && serverConfig.args.includes("run")) {
        const runIndex = serverConfig.args.indexOf("run");
        for (let i = runIndex + 1; i < serverConfig.args.length; i++) {
            if (!serverConfig.args[i].startsWith("-")) {
                watchFile = (0, mod_ts_2.resolve)(serverConfig.cwd || ".", serverConfig.args[i]);
                break;
            }
        }
    }
    else if ((serverConfig.command === "python" || serverConfig.command === "python3") && firstArg) {
        watchFile = (0, mod_ts_2.resolve)(serverConfig.cwd || ".", firstArg);
    }
}
if (watchFile) {
    hmrEnv.MCP_WATCH_FILE = watchFile;
}
console.log(`🚀 Starting MCP Server HMR for '${serverName}'`);
console.log(`📋 Config: ${configPath}`);
if (configPath.endsWith('.mcp.json')) {
    console.log(`📍 Source: Claude Code project config`);
}
else if (configPath.includes('Claude/claude_desktop_config.json')) {
    console.log(`📍 Source: Claude Desktop config`);
}
else {
    console.log(`📍 Source: Custom config file`);
}
console.log(`📟 Command: ${serverConfig.command} ${(serverConfig.args || []).join(" ")}`);
if (serverConfig.cwd)
    console.log(`📁 Working Directory: ${serverConfig.cwd}`);
if (watchFile)
    console.log(`👀 Watching: ${watchFile}`);
console.log();
const mainPath = (0, mod_ts_2.join)(new URL(".", import.meta.url).pathname, "main.ts");
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
const status = await hmrProcess.status;
Deno.exit(status.code);
