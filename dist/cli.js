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
import { parseWatchAndCommand } from "./cli-utils.js";
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
    .option('--watch <path>', 'Add file/directory to watch (can be used multiple times)')
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
  
Watch Mode Examples:
  mcpmon --watch ./src --watch ./config node server.js  # Watch multiple paths
  mcpmon --watch ./files node server.js                  # Explicit watch directory
  mcpmon --watch ./src --watch ./config docker run -i my-app  # Docker with explicit paths
  
  Auto-detection mode (default):
    mcpmon node server.js                 # Automatically watches server.js
    mcpmon python app.py                  # Automatically watches app.py
  
  Explicit watch mode (recommended for containers):
    mcpmon --watch ./app docker run -i my-mcp-server
    mcpmon --watch /code/src docker compose exec app python server.py
  
  Mixed mode (both explicit and auto-detected):
    mcpmon --watch ./lib node server.js   # Watches both ./lib and server.js

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

Watch Modes:
  • Auto-detection: Automatically detects files from command arguments
  • Explicit: Use --watch flags for full control over what to monitor
  • Mixed: Combines explicit paths with auto-detected files
  • Use explicit mode for Docker containers and complex setups
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
    // Get explicit watch targets from pre-processed arguments
    const explicitWatchTargets = program._watchTargetsFromArgs || [];
    await runProxy(command, args, options, explicitWatchTargets);
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
async function listExtensions(options) {
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
    }
    catch (error) {
        console.error("❌ Failed to load extensions:", error);
        if (verbose) {
            console.error(error);
        }
        process.exit(1);
    }
}
function autoDetectWatchFile(command, args) {
    // Look for the first file argument that looks like a script
    for (const arg of args) {
        // Skip flags
        if (arg.startsWith("-"))
            continue;
        const ext = extname(arg);
        // Common script extensions
        if ([".js", ".mjs", ".ts", ".py", ".rb", ".php"].includes(ext)) {
            return resolve(arg);
        }
    }
    return null;
}
async function runProxy(command, args, options, explicitWatchTargets = []) {
    // Build watch targets array from multiple sources
    let watchTargets = [];
    // 1. Start with explicit --watch targets from command line
    if (explicitWatchTargets.length > 0) {
        watchTargets = [...explicitWatchTargets];
    }
    // 2. Add from legacy --watch option (comma-separated) 
    if (options.watch) {
        const watchPaths = options.watch.split(",").map((p) => p.trim());
        watchTargets.push(...watchPaths);
    }
    // 3. Add from environment variable
    if (process.env.MCPMON_WATCH) {
        const watchPaths = process.env.MCPMON_WATCH.split(",").map((p) => p.trim());
        watchTargets.push(...watchPaths);
    }
    // 4. Auto-detect if no explicit targets, or always add auto-detected for mixed mode
    const autoDetectedFile = autoDetectWatchFile(command, args);
    if (autoDetectedFile) {
        if (watchTargets.length === 0) {
            // Pure auto-detection mode (backward compatibility)
            watchTargets.push(autoDetectedFile);
        }
        else {
            // Mixed mode: add auto-detected to explicit targets (avoid duplicates)
            if (!watchTargets.includes(autoDetectedFile)) {
                watchTargets.push(autoDetectedFile);
            }
        }
    }
    // Deduplicate watch targets
    watchTargets = [...new Set(watchTargets)];
    // Set verbose mode from CLI option or environment variable
    const verbose = options.verbose || process.env.MCPMON_VERBOSE;
    if (verbose) {
        console.error(`🔧 mcpmon starting...`);
        console.error(`📟 Command: ${command} ${args.join(" ")}`);
        if (watchTargets.length > 0) {
            console.error(`👀 Watching: ${watchTargets.join(", ")}`);
        }
        else {
            console.error(`⚠️  No files to watch detected`);
        }
    }
    // Create and configure extension registry
    let extensionRegistry;
    try {
        // Parse extension configuration
        let extensionConfigs = {};
        if (options.extensionConfig) {
            try {
                extensionConfigs = JSON.parse(options.extensionConfig);
            }
            catch (error) {
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
            }
            else {
                console.error(`🔌 No extensions enabled`);
            }
        }
    }
    catch (error) {
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
    const stdin = new ReadableStream({
        start(controller) {
            process.stdin.on("data", (chunk) => {
                controller.enqueue(new Uint8Array(chunk));
            });
            process.stdin.on("end", () => {
                controller.close();
            });
        },
    });
    const stdout = new WritableStream({
        write(chunk) {
            return new Promise((resolve, reject) => {
                process.stdout.write(chunk, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        },
    });
    const stderr = new WritableStream({
        write(chunk) {
            return new Promise((resolve, reject) => {
                process.stderr.write(chunk, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
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
    const proxy = new MCPProxy({
        procManager,
        fs,
        extensionRegistry,
        stdin,
        stdout,
        stderr,
        exit: (code) => process.exit(code),
    }, {
        command,
        commandArgs: args,
        watchTargets: watchTargets,
        restartDelay,
        env: Object.fromEntries(Object.entries(process.env).filter(([_, value]) => value !== undefined)), // Pass through all environment variables
        killDelay: 1000,
        readyDelay: 2000,
        dataDir: extensionsDataDir,
    });
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
    // Pre-process arguments to extract --watch flags before Commander.js processes them
    let watchTargetsFromArgs = [];
    let processedArgs = process.argv.slice(2);
    try {
        const parsed = parseWatchAndCommand(process.argv.slice(2));
        if (parsed.watchTargets.length > 0) {
            watchTargetsFromArgs = parsed.watchTargets;
            // Remove --watch flags from arguments before passing to Commander.js
            // This prevents conflicts with the existing --watch option
            processedArgs = [];
            const originalArgs = process.argv.slice(2);
            for (let i = 0; i < originalArgs.length; i++) {
                const arg = originalArgs[i];
                if (arg === '--watch') {
                    // Skip --watch and its value
                    i++; // Skip the path argument too
                }
                else {
                    processedArgs.push(arg);
                }
            }
        }
    }
    catch (parseError) {
        // If parsing fails, show help message
        console.error("❌ CLI parsing error:", parseError.message);
        program.help();
        process.exit(1);
    }
    // Store watch targets for use in action handler
    program._watchTargetsFromArgs = watchTargetsFromArgs;
    // Parse with processed arguments
    await program.parseAsync([process.argv[0], process.argv[1], ...processedArgs]);
}
catch (error) {
    console.error("❌ mcpmon failed to start:", error.message);
    if (process.env.MCPMON_VERBOSE) {
        console.error(error.stack);
    }
    process.exit(1);
}
