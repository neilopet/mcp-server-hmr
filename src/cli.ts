#!/usr/bin/env node
/**
 * mcpmon - Hot-reload monitor for MCP servers
 *
 * Like nodemon, but for Model Context Protocol servers.
 * Automatically restarts your MCP server when files change.
 *
 * Usage:
 *   mcpmon node server.js
 *   mcpmon python server.py
 *   mcpmon deno run server.ts
 */

import { resolve, dirname, extname, join } from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { NodeFileSystem } from "./node/NodeFileSystem.js";
import { NodeProcessManager } from "./node/NodeProcessManager.js";
import { MCPProxy } from "./proxy.js";
import { setupCommand } from "./setup.js";
import { ExtensionRegistry } from "./extensions/index.js";

// Check if we're running on an outdated Node.js version
const nodeVersion = process.version;
const [major] = nodeVersion.slice(1).split('.').map(Number);

if (major < 16) {
  console.error(`❌ mcpmon requires Node.js 16+ but found ${nodeVersion}`);
  console.error(`💡 Try running with a newer Node.js version: ~/.nvm/versions/node/v20.12.2/bin/node $(which mcpmon)`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('mcpmon')
  .description('Hot-reload monitor for MCP servers - like nodemon but for Model Context Protocol')
  .version('0.3.0')
  .allowUnknownOption();

// Main proxy command (default action)
program
  .argument('[command]', 'Command to run (node, python, deno, etc.)')
  .argument('[args...]', 'Arguments to pass to command')
  .option('--watch <paths>', 'Override files/directories to watch (comma-separated)')
  .option('--delay <ms>', 'Restart delay in milliseconds', '1000')
  .option('--verbose', 'Enable verbose logging')
  .option('--enable-extension <name>', 'Enable specific extension', [])
  .option('--disable-extension <name>', 'Disable specific extension', [])
  .option('--list-extensions', 'List available extensions and exit')
  .option('--extensions-data-dir <path>', 'Set extension data directory')
  .option('--extension-config <json>', 'Extension configuration as JSON')
  .addHelpText('after', `
Examples:
  mcpmon node server.js
  mcpmon python server.py
  mcpmon deno run server.ts
  mcpmon node --inspect server.js
  
Extension Examples:
  mcpmon --list-extensions                           # List available extensions
  mcpmon --enable-extension large-response-handler node server.js
  mcpmon --extensions-data-dir ./data node server.js
  mcpmon --extension-config '{"threshold":10}' node server.js

Environment Variables:
  MCPMON_WATCH             Override files/directories to watch (comma-separated)
  MCPMON_DELAY             Restart delay in milliseconds (default: 1000)
  MCPMON_VERBOSE           Enable verbose logging
  MCPMON_EXTENSIONS_DIR    Extension data directory (default: ./mcpmon-data)

Like nodemon, but for Model Context Protocol servers.
Automatically restarts your server when files change.
`)
  .action(async (command, args, options) => {
    // Handle list extensions command (doesn't require a command)
    if (options.listExtensions) {
      await listExtensions(options);
      return;
    }

    if (!command) {
      program.help();
      return;
    }

    await runProxy(command, args, options);
  });

// Setup subcommand
program
  .command('setup')
  .description('Configure MCP servers to use hot-reload')
  .argument('[server-name]', 'Server name to configure')
  .option('-c, --config <path>', 'Path to config file (auto-detected if not specified)')
  .option('-l, --list', 'List available servers in the config')
  .option('--all', 'Setup all stdio servers')
  .option('--restore', 'Restore config from latest backup')
  .addHelpText('after', `
Examples:
  mcpmon setup my-server          # Configure my-server to use hot-reload
  mcpmon setup --all              # Configure all stdio servers
  mcpmon setup --list             # Show all available servers
  mcpmon setup --restore          # Restore original config

The setup command modifies your Claude Desktop or Claude Code configuration
to wrap MCP servers with mcpmon for hot-reload capabilities. A backup is
automatically created before any changes are made.
`)
  .action(setupCommand);

async function listExtensions(options: any) {
  const verbose = options.verbose || process.env.MCPMON_VERBOSE;
  
  // Create extension registry to load and display available extensions
  const registry = new ExtensionRegistry();
  
  try {
    if (verbose) {
      console.error("🔌 Loading built-in extensions...");
    }
    
    await registry.loadBuiltinExtensions();
    
    const allExtensions = registry.getAll();
    const enabledExtensions = registry.getEnabled();
    
    if (allExtensions.length === 0) {
      console.log("📋 No extensions available");
      console.log("\n💡 Extensions can provide additional functionality like:");
      console.log("   • Large response handling and persistence");
      console.log("   • Request/response logging and metrics");
      console.log("   • Authentication and rate limiting");
      console.log("   • Custom data transformations");
      return;
    }
    
    console.log(`📦 Available Extensions (${allExtensions.length} total):\n`);
    
    for (const ext of allExtensions) {
      const enabled = enabledExtensions.some(e => e.id === ext.id);
      const status = enabled ? "🟢 enabled" : "⚪ disabled";
      const defaultStatus = ext.defaultEnabled ? " (default enabled)" : "";
      
      console.log(`  ${status} ${ext.name} v${ext.version}${defaultStatus}`);
      console.log(`    ID: ${ext.id}`);
      console.log();
    }
    
    console.log("Usage:");
    console.log("  mcpmon --enable-extension <id> <command>");
    console.log("  mcpmon --disable-extension <id> <command>");
    console.log("  mcpmon --extensions-data-dir <path> <command>");
    
  } catch (error) {
    console.error("❌ Failed to load extensions:", error);
    if (verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

function autoDetectWatchFile(command: string, args: string[]): string | null {
  // Look for the first file argument that looks like a script
  for (const arg of args) {
    // Skip flags
    if (arg.startsWith("-")) continue;

    const ext = extname(arg);

    // Common script extensions
    if ([".js", ".mjs", ".ts", ".py", ".rb", ".php"].includes(ext)) {
      return resolve(arg);
    }
  }

  return null;
}

async function runProxy(command: string, args: string[], options: any) {
  // Auto-detect what file to watch
  let watchFile = autoDetectWatchFile(command, args);

  // Override with CLI option or environment variable
  if (options.watch) {
    const watchPaths = options.watch.split(",").map((p: string) => p.trim());
    watchFile = watchPaths[0]; // Use first path for now
  } else if (process.env.MCPMON_WATCH) {
    const watchPaths = process.env.MCPMON_WATCH.split(",").map((p) => p.trim());
    watchFile = watchPaths[0]; // Use first path for now
  }

  // Set verbose mode from CLI option or environment variable
  const verbose = options.verbose || process.env.MCPMON_VERBOSE;
  if (verbose) {
    console.error(`🔧 mcpmon starting...`);
    console.error(`📟 Command: ${command} ${args.join(" ")}`);
    if (watchFile) {
      console.error(`👀 Watching: ${watchFile}`);
    } else {
      console.error(`⚠️  No file to watch detected`);
    }
  }

  // Create and configure extension registry
  let extensionRegistry: ExtensionRegistry | undefined;
  try {
    // Parse extension configuration
    let extensionConfigs: Record<string, any> = {};
    if (options.extensionConfig) {
      try {
        extensionConfigs = JSON.parse(options.extensionConfig);
      } catch (error) {
        console.error("❌ Invalid extension config JSON:", error);
        process.exit(1);
      }
    }

    // Collect enabled/disabled extensions from CLI
    const enabledExtensions = Array.isArray(options.enableExtension) 
      ? options.enableExtension 
      : options.enableExtension ? [options.enableExtension] : [];
    const disabledExtensions = Array.isArray(options.disableExtension)
      ? options.disableExtension
      : options.disableExtension ? [options.disableExtension] : [];

    // Create extension registry with configuration
    extensionRegistry = new ExtensionRegistry({
      enabledExtensions,
      disabledExtensions,
      extensionConfigs
    });

    // Load built-in extensions
    await extensionRegistry.loadBuiltinExtensions();

    if (verbose) {
      const enabled = extensionRegistry.getEnabled();
      if (enabled.length > 0) {
        console.error(`🔌 Extensions enabled: ${enabled.map(e => e.name).join(', ')}`);
      } else {
        console.error(`🔌 No extensions enabled`);
      }
    }

  } catch (error) {
    console.error("❌ Failed to initialize extensions:", error);
    if (verbose) {
      console.error(error);
    }
    // Continue without extensions rather than failing
    extensionRegistry = undefined;
  }

  // Create dependencies
  const fs = new NodeFileSystem();
  const procManager = new NodeProcessManager();

  // Create streams for the proxy
  const stdin = new ReadableStream<Uint8Array>({
    start(controller) {
      process.stdin.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      process.stdin.on("end", () => {
        controller.close();
      });
    },
  });

  const stdout = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        process.stdout.write(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  });

  const stderr = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        process.stderr.write(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  });

  // Create proxy config
  const restartDelay = options.delay ? parseInt(options.delay) : 
    (process.env.MCPMON_DELAY ? parseInt(process.env.MCPMON_DELAY) : 1000);

  // Determine extensions data directory
  const extensionsDataDir = options.extensionsDataDir || 
    process.env.MCPMON_EXTENSIONS_DIR || 
    join(process.cwd(), 'mcpmon-data');

  const proxy = new MCPProxy(
    {
      procManager,
      fs,
      extensionRegistry,
      stdin,
      stdout,
      stderr,
      exit: (code: number) => process.exit(code),
    },
    {
      command,
      commandArgs: args,
      entryFile: watchFile,
      restartDelay,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>, // Pass through all environment variables
      killDelay: 1000,
      readyDelay: 2000,
      dataDir: extensionsDataDir,
    }
  );

  // Handle signals gracefully
  process.on("SIGINT", async () => {
    if (verbose) {
      console.error(`\n🛑 Received SIGINT, shutting down...`);
    }
    await proxy.shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    if (verbose) {
      console.error(`\n🛑 Received SIGTERM, shutting down...`);
    }
    await proxy.shutdown();
    process.exit(0);
  });

  // Start the proxy
  await proxy.start();
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Parse command line arguments and run
try {
  await program.parseAsync();
} catch (error: any) {
  console.error("❌ mcpmon failed to start:", error.message);
  if (process.env.MCPMON_VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
}
