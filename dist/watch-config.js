#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

// Polyfill Deno global
global.Deno = {
  args: process.argv.slice(2),
  env: {
    get: (key) => process.env[key],
    set: (key, value) => { process.env[key] = value; },
    toObject: () => ({ ...process.env })
  },
  build: {
    os: process.platform === 'darwin' ? 'darwin' : 
        process.platform === 'win32' ? 'windows' : 'linux'
  },
  exit: (code) => process.exit(code),
  readTextFile: async (filepath) => {
    return fs.promises.readFile(filepath, 'utf8');
  },
  writeTextFile: async (filepath, content, options) => {
    if (options?.append) {
      return fs.promises.appendFile(filepath, content, 'utf8');
    }
    return fs.promises.writeFile(filepath, content, 'utf8');
  },
  stat: async (filepath) => {
    const stats = await fs.promises.stat(filepath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime
    };
  },
  chmod: async (filepath, mode) => {
    return fs.promises.chmod(filepath, mode);
  },
  copyFile: async (src, dest) => {
    return fs.promises.copyFile(src, dest);
  },
  Command: class Command {
    constructor(cmd, options = {}) {
      this.cmd = cmd;
      this.options = options;
    }
    
    spawn() {
      const proc = spawn(this.cmd, this.options.args || [], {
        stdio: [
          this.options.stdin === 'piped' ? 'pipe' : 'inherit',
          this.options.stdout === 'piped' ? 'pipe' : 'inherit',
          this.options.stderr === 'piped' ? 'pipe' : 'inherit'
        ],
        env: this.options.env || process.env,
        cwd: this.options.cwd,
        shell: process.platform === 'win32'
      });
      
      const stdin = proc.stdin ? {
        getWriter: () => ({
          write: (data) => new Promise((resolve, reject) => {
            const buffer = data instanceof Uint8Array ? Buffer.from(data) : data;
            proc.stdin.write(buffer, (err) => err ? reject(err) : resolve());
          }),
          releaseLock: () => {}
        })
      } : null;
      
      const createReader = (stream) => {
        if (!stream) return null;
        let chunks = [];
        let resolver = null;
        
        stream.on('data', (chunk) => {
          if (resolver) {
            resolver({ value: new Uint8Array(chunk), done: false });
            resolver = null;
          } else {
            chunks.push(chunk);
          }
        });
        
        stream.on('end', () => {
          if (resolver) {
            resolver({ done: true });
          }
        });
        
        return {
          getReader: () => ({
            read: () => new Promise((resolve) => {
              if (chunks.length > 0) {
                resolve({ value: new Uint8Array(chunks.shift()), done: false });
              } else {
                resolver = resolve;
              }
            })
          })
        };
      };
      
      return {
        pid: proc.pid,
        stdin,
        stdout: createReader(proc.stdout),
        stderr: createReader(proc.stderr),
        status: new Promise((resolve) => {
          proc.on('exit', (code) => resolve({ code, success: code === 0 }));
        }),
        kill: (signal) => proc.kill(signal)
      };
    }
  },
  watchFs: (paths) => {
    const watcher = chokidar.watch(Array.isArray(paths) ? paths : [paths], {
      persistent: true,
      ignoreInitial: true
    });
    
    const events = [];
    let resolver = null;
    
    watcher.on('all', (eventType, filepath) => {
      const kindMap = {
        'add': 'create',
        'change': 'modify', 
        'unlink': 'remove'
      };
      
      const event = {
        kind: kindMap[eventType] || 'other',
        paths: [path.resolve(filepath)]
      };
      
      if (resolver) {
        resolver({ value: event, done: false });
        resolver = null;
      } else {
        events.push(event);
      }
    });
    
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise((resolve) => {
            if (events.length > 0) {
              resolve({ value: events.shift(), done: false });
            } else {
              resolver = resolve;
            }
          })
        };
      }
    };
  },
  addSignalListener: (signal, handler) => {
    process.on(signal, handler);
  }
};

// TextEncoder/TextDecoder
if (!global.TextEncoder) {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
}

// Import replacements
const parse = require('minimist');
const { resolve, join } = require('path');
const existsSync = (filepath) => {
  try {
    fs.statSync(filepath);
    return true;
  } catch {
    return false;
  }
};

// Debounce function
function debounce(fn, delay) {
  let timeoutId = null;
  let lastCallTime = 0;
  
  const debounced = function(...args) {
    const now = Date.now();
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    const timeSinceLastCall = now - lastCallTime;
    
    if (timeSinceLastCall >= delay) {
      lastCallTime = now;
      fn.apply(this, args);
    } else {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        fn.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
  
  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

// Compatibility
const DebouncedFunction = function() {};


// Transformed from src/config_launcher.ts

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









// Check if a server uses stdio transport (not SSE or HTTP)
function isStdioServer(serverConfig) {
  // Check for explicit transport specification
  if ('transport' in serverConfig) {
    return (serverConfig).transport === 'stdio';
  }
  
  // Check for SSE/HTTP indicators
  const command = serverConfig.command.toLowerCase();
  const args = (serverConfig.args || []).join(' ').toLowerCase();
  const fullCommand = `${command} ${args}`;
  
  // Common SSE/HTTP server indicators
  if (fullCommand.includes('--port') || 
      fullCommand.includes('--http') || 
      fullCommand.includes('--sse') ||
      fullCommand.includes('server.listen') ||
      fullCommand.includes('express') ||
      fullCommand.includes('fastify')) {
    return false;
  }
  
  // Docker containers often use stdio
  if (command === 'docker' && args.includes('-i')) {
    return true;
  }
  
  // Default to stdio for most servers
  return true;
}

// Setup hot-reload for selected servers
async function setupHotReload(
  config, 
  configPath, 
  serverName,
  setupAll) {
  console.log(`🔧 Setting up hot-reload proxy...`);
  console.log(`📋 Config: ${configPath}`);
  
  // Create backup
  const backupPath = configPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await Deno.copyFile(configPath, backupPath);
    console.log(`💾 Backup created: ${backupPath}`);
  } catch (error) {
    console.error(`❌ Failed to create backup: ${error.message}`);
    Deno.exit(1);
  }
  
  // Determine which servers to setup
  let serversToSetup = [];
  
  if (setupAll) {
    // Setup all stdio servers
    serversToSetup = Object.entries(config.mcpServers)
      .filter(([_, cfg]) => isStdioServer(cfg))
      .map(([name]) => name);
    
    if (serversToSetup.length === 0) {
      console.error(`❌ No stdio servers found to setup`);
      Deno.exit(1);
    }
    
    console.log(`\n📦 Found ${serversToSetup.length} stdio servers to setup:`);
    serversToSetup.forEach(name => console.log(`   - ${name}`));
  } else if (typeof serverName === 'string' && serverName) {
    // Setup specific server
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
  } else {
    console.error(`❌ Please specify a server name or use --all`);
    Deno.exit(1);
  }
  
  // Get the absolute path to our tools
  const scriptDir = new URL(".", __filename).pathname;
  const mainPath = resolve(scriptDir, "main.ts");
  const configLauncherPath = resolve(scriptDir, "config_launcher.ts");
  
  // Replace each server with hot-reload version
  const newConfig = { ...config };
  const modifiedServers = [];
  
  for (const name of serversToSetup) {
    const original = config.mcpServers[name];
    
    // Store original config with -original suffix
    const originalName = `${name}-original`;
    newConfig.mcpServers[originalName] = { ...original };
    
    // Replace with hot-reload version
    newConfig.mcpServers[name] = {
      command: mainPath,
      args: [original.command, ...(original.args || [])],
      env: original.env,
      cwd: original.cwd
    };
    
    modifiedServers.push(name);
  }
  
  // Write updated config
  try {
    const configText = JSON.stringify(newConfig, null, 2);
    await Deno.writeTextFile(configPath, configText);
    console.log(`\n✅ Updated config file: ${configPath}`);
  } catch (error) {
    console.error(`❌ Failed to write config: ${error.message}`);
    Deno.exit(1);
  }
  
  // Show summary
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
  } else if (configPath.includes('.mcp.json')) {
    console.log(`\n⚠️  Restart Claude Code or reload the project`);
  }
}

// Parse command line arguments

// Main execution
(async () => {
const args = parse(Deno.args, {
  string: ["server", "config", "s", "c", "setup"],
  boolean: ["help", "h", "list", "l", "all"],
  alias: {
    server: "s",
    config: "c",
    help: "h",
    list: "l"
  }
});

// Helper function to find config file
function findConfigFile(providedPath) {
  // If path is provided, use it directly
  if (providedPath) {
    const resolvedPath = resolve(providedPath);
    if (existsSync(resolvedPath)) {
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
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
  if (Deno.build.os === "darwin") {
    searchPaths.push(resolve(home, "Library/Application Support/Claude/claude_desktop_config.json"));
  } else if (Deno.build.os === "windows") {
    const appData = Deno.env.get("APPDATA");
    if (appData) {
      searchPaths.push(resolve(appData, "Claude/claude_desktop_config.json"));
    }
  } else if (Deno.build.os === "linux") {
    searchPaths.push(resolve(home, ".config/Claude/claude_desktop_config.json"));
  }
  
  // 3. Current directory mcpServers.json
  searchPaths.push(resolve("./mcpServers.json"));
  
  // Check each path
  for (const path of searchPaths) {
    if (existsSync(path)) {
      console.log(`📋 Found config at: ${path}`);
      return path;
    }
  }
  
  return null;
}

// Show help
if (args.help || (!args.server && !args.list && !args.setup && !args.all)) {
  console.log(`MCP Server Watch - Hot-reload for MCP servers

Usage:
  watch --server <server-name> [--config ]
  watch -s <server-name> [-c ]
  watch --list [--config ]
  watch --setup [<server-name>] [--all] [--config ]
  watch --help

Options:
  -s, --server     Name of the server to proxy from config
  -c, --config     Path to config file (see below for defaults)
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

// Find and load config file
const configPath = findConfigFile(args.config);
if (!configPath) {
  console.error(`\n❌ No config file found!`);
  console.error(`\nSearched in:`);
  console.error(`  1. .mcp.json (Claude Code project config)`);
  if (Deno.build.os === "darwin") {
    console.error(`  2. ~/Library/Application Support/Claude/claude_desktop_config.json`);
  } else if (Deno.build.os === "windows") {
    console.error(`  2. %APPDATA%\\Claude\\claude_desktop_config.json`);
  } else {
    console.error(`  2. ~/.config/Claude/claude_desktop_config.json`);
  }
  console.error(`  3. ./mcpServers.json`);
  console.error(`\nYou can specify a custom path with --config `);
  Deno.exit(1);
}

let config;
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

// Setup mode - configure servers to use hot-reload proxy
if (args.setup !== undefined || args.all) {
  await setupHotReload(config, configPath, args.setup | boolean, args.all);
  Deno.exit(0);
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
const serverName = args.server;
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
const hmrEnv = {
  ...Deno.env.toObject(),  // Include current environment
  ...serverConfig.env,      // Include server-specific env vars
  MCP_SERVER_COMMAND: serverConfig.command,
  MCP_SERVER_ARGS: (serverConfig.args || []).join(" ")
};

// Determine what file to watch based on the command and args
let watchFile;
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

// Show source of config
if (configPath.endsWith('.mcp.json')) {
  console.log(`📍 Source: Claude Code project config`);
} else if (configPath.includes('Claude/claude_desktop_config.json')) {
  console.log(`📍 Source: Claude Desktop config`);
} else {
  console.log(`📍 Source: Custom config file`);
}

console.log(`📟 Command: ${serverConfig.command} ${(serverConfig.args || []).join(" ")}`);
if (serverConfig.cwd) console.log(`📁 Working Directory: ${serverConfig.cwd}`);
if (watchFile) console.log(`👀 Watching: ${watchFile}`);
console.log();

// Find the main.ts file relative to this script
const mainPath = join(new URL(".", __filename).pathname, "main.ts");

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

})().catch(console.error);
