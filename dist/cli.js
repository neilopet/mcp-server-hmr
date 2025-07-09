#!/usr/bin/env node --no-warnings
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
import { spawn } from "child_process";
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
/**
 * Check if a process with the given PID is still running
 */
function isProcessAlive(pid) {
    try {
        // process.kill(pid, 0) doesn't actually kill the process,
        // it just checks if the process exists and we have permission to signal it
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        // ESRCH = No such process
        // EPERM = Operation not permitted (process exists but we can't signal it)
        return err.code === 'EPERM';
    }
}
/**
 * Parse ps command output to extract process information
 */
function parseProcessInfo(line) {
    // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11)
        return null;
    const user = parts[0];
    const pid = parseInt(parts[1]);
    const command = parts[10];
    const fullCommand = parts.slice(10).join(' ');
    // Get UID for the user (simplified - just check if it's current user)
    const currentUser = process.env.USER || process.env.USERNAME || '';
    if (user !== currentUser)
        return null;
    return {
        pid,
        uid: process.getuid ? process.getuid() : 0,
        command,
        fullCommand
    };
}
/**
 * Find all mcpmon processes running on the system
 */
async function findMcpmonProcesses() {
    return new Promise((resolve, reject) => {
        const ps = spawn('ps', ['aux'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        let errorOutput = '';
        ps.stdout.on('data', (data) => {
            output += data.toString();
        });
        ps.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        ps.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ps command failed: ${errorOutput}`));
                return;
            }
            const lines = output.split('\n');
            const processes = [];
            for (const line of lines) {
                if (line.includes('mcpmon') && !line.includes('ps aux')) {
                    const processInfo = parseProcessInfo(line);
                    if (processInfo && processInfo.pid !== process.pid) {
                        processes.push(processInfo);
                    }
                }
            }
            resolve(processes);
        });
        ps.on('error', (err) => {
            reject(err);
        });
    });
}
/**
 * Find Docker containers that might be mcpmon-related
 */
async function findMcpmonDockerContainers() {
    return new Promise((resolve) => {
        const docker = spawn('docker', ['ps', '-a', '--format', '{{.ID}} {{.Command}} {{.Names}}'], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        docker.stdout.on('data', (data) => {
            output += data.toString();
        });
        docker.on('close', (code) => {
            if (code !== 0) {
                // Docker not available or failed
                resolve([]);
                return;
            }
            const lines = output.split('\n');
            const containers = [];
            for (const line of lines) {
                // Look for containers that might be mcpmon-related
                // This is conservative - we only look for obvious patterns
                if (line.includes('mcpmon') || line.includes('mcp-server')) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length > 0) {
                        containers.push(parts[0]); // Container ID
                    }
                }
            }
            resolve(containers);
        });
        docker.on('error', () => {
            // Docker not available
            resolve([]);
        });
    });
}
/**
 * Find orphaned Docker containers managed by mcpmon
 * These are containers that were started by mcpmon instances that have crashed or been killed
 */
async function findOrphanedContainers(verbose = false) {
    return new Promise((resolve) => {
        // First, find all containers with mcpmon.managed=true label
        const docker = spawn('docker', ['ps', '-q', '--filter', 'label=mcpmon.managed=true'], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        let errorOutput = '';
        docker.stdout.on('data', (data) => {
            output += data.toString();
        });
        docker.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        docker.on('close', async (code) => {
            if (code !== 0) {
                if (verbose) {
                    console.error(`⚠️  Failed to query Docker containers: ${errorOutput}`);
                }
                resolve([]);
                return;
            }
            const containerIds = output.trim().split('\n').filter(id => id.length > 0);
            if (containerIds.length === 0) {
                resolve([]);
                return;
            }
            if (verbose) {
                console.log(`🔍 Found ${containerIds.length} mcpmon-managed container(s), checking for orphans...`);
            }
            const orphanedContainers = [];
            // Inspect each container to get label information
            for (const containerId of containerIds) {
                try {
                    const containerInfo = await inspectContainer(containerId, verbose);
                    if (containerInfo && containerInfo.isOrphaned) {
                        orphanedContainers.push(containerInfo);
                    }
                }
                catch (err) {
                    if (verbose) {
                        console.error(`❌ Failed to inspect container ${containerId}: ${err}`);
                    }
                }
            }
            resolve(orphanedContainers);
        });
        docker.on('error', (err) => {
            if (verbose) {
                console.error(`❌ Docker command error: ${err}`);
            }
            resolve([]);
        });
    });
}
/**
 * Inspect a single container and determine if it's orphaned
 */
async function inspectContainer(containerId, verbose = false) {
    return new Promise((resolve) => {
        const docker = spawn('docker', ['inspect', containerId], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        let errorOutput = '';
        docker.stdout.on('data', (data) => {
            output += data.toString();
        });
        docker.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        docker.on('close', (code) => {
            if (code !== 0) {
                if (verbose) {
                    console.error(`⚠️  Failed to inspect container ${containerId}: ${errorOutput}`);
                }
                resolve(null);
                return;
            }
            try {
                const inspectData = JSON.parse(output);
                if (!inspectData || inspectData.length === 0) {
                    resolve(null);
                    return;
                }
                const container = inspectData[0];
                const labels = container.Config?.Labels || {};
                // Extract mcpmon labels
                const sessionId = labels['mcpmon.session'];
                const pid = labels['mcpmon.pid'] ? parseInt(labels['mcpmon.pid']) : undefined;
                const startTime = labels['mcpmon.started'] ? parseInt(labels['mcpmon.started']) : undefined;
                if (verbose) {
                    console.log(`🐳 Container ${containerId.substring(0, 12)}:`);
                    console.log(`   Session: ${sessionId || 'unknown'}`);
                    console.log(`   PID: ${pid || 'unknown'}`);
                    console.log(`   Started: ${startTime ? new Date(startTime).toLocaleString() : 'unknown'}`);
                }
                // Check if the mcpmon process is still alive
                let isOrphaned = false;
                if (pid) {
                    if (!isProcessAlive(pid)) {
                        isOrphaned = true;
                        if (verbose) {
                            console.log(`   Status: ❌ Orphaned (PID ${pid} is dead)`);
                        }
                    }
                    else if (verbose) {
                        console.log(`   Status: ✅ Active (PID ${pid} is alive)`);
                    }
                }
                else {
                    // No PID label means it's likely orphaned
                    isOrphaned = true;
                    if (verbose) {
                        console.log(`   Status: ❌ Orphaned (no PID information)`);
                    }
                }
                resolve({
                    id: containerId,
                    sessionId,
                    pid,
                    startTime,
                    isOrphaned
                });
            }
            catch (err) {
                if (verbose) {
                    console.error(`❌ Failed to parse container inspect data: ${err}`);
                }
                resolve(null);
            }
        });
        docker.on('error', (err) => {
            if (verbose) {
                console.error(`❌ Docker inspect error: ${err}`);
            }
            resolve(null);
        });
    });
}
/**
 * Clean up orphaned Docker containers
 */
async function cleanupOrphanedContainers(containers, verbose = false) {
    const stopped = [];
    const failed = [];
    for (const container of containers) {
        try {
            console.log(`🧹 Cleaning up orphaned container ${container.id.substring(0, 12)}:`);
            console.log(`   • Session: ${container.sessionId || 'unknown'}`);
            console.log(`   • Dead PID: ${container.pid || 'unknown'}`);
            console.log(`   • Started: ${container.startTime ? new Date(container.startTime).toLocaleString() : 'unknown'}`);
            await new Promise((resolve) => {
                const docker = spawn('docker', ['stop', container.id], {
                    stdio: verbose ? 'inherit' : 'ignore'
                });
                docker.on('close', (code) => {
                    if (code === 0) {
                        stopped.push(container.id);
                        console.log(`   ✅ Successfully stopped container`);
                        resolve();
                    }
                    else {
                        // Try force kill if stop fails
                        const dockerKill = spawn('docker', ['kill', container.id], {
                            stdio: verbose ? 'inherit' : 'ignore'
                        });
                        dockerKill.on('close', (killCode) => {
                            if (killCode === 0) {
                                stopped.push(container.id);
                                console.log(`   ✅ Successfully killed container`);
                            }
                            else {
                                failed.push(container.id);
                                console.log(`   ❌ Failed to stop/kill container`);
                            }
                            resolve();
                        });
                        dockerKill.on('error', () => {
                            failed.push(container.id);
                            console.log(`   ❌ Failed to kill container`);
                            resolve();
                        });
                    }
                });
                docker.on('error', () => {
                    failed.push(container.id);
                    console.log(`   ❌ Failed to stop container`);
                    resolve();
                });
            });
        }
        catch (err) {
            failed.push(container.id);
            console.log(`   ❌ Error cleaning container: ${err}`);
        }
    }
    return { stopped, failed };
}
/**
 * Terminate a process safely
 */
async function terminateProcess(pid, verbose = false) {
    try {
        if (verbose) {
            console.log(`🛑 Terminating process ${pid}...`);
        }
        // Try SIGTERM first
        process.kill(pid, 'SIGTERM');
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Check if still alive
        if (isProcessAlive(pid)) {
            if (verbose) {
                console.log(`💀 Process ${pid} still alive, sending SIGKILL...`);
            }
            process.kill(pid, 'SIGKILL');
            // Wait a bit more
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return !isProcessAlive(pid);
    }
    catch (err) {
        if (err.code === 'ESRCH') {
            // Process already dead
            return true;
        }
        if (verbose) {
            console.error(`❌ Failed to terminate process ${pid}: ${err.message}`);
        }
        return false;
    }
}
/**
 * Stop Docker containers
 */
async function stopDockerContainers(containerIds, verbose = false) {
    const stopped = [];
    const failed = [];
    for (const containerId of containerIds) {
        try {
            if (verbose) {
                console.log(`🐳 Stopping Docker container ${containerId}...`);
            }
            await new Promise((resolve, reject) => {
                const docker = spawn('docker', ['stop', containerId], { stdio: verbose ? 'inherit' : 'ignore' });
                docker.on('close', (code) => {
                    if (code === 0) {
                        stopped.push(containerId);
                        resolve();
                    }
                    else {
                        failed.push(containerId);
                        resolve(); // Don't fail the whole operation
                    }
                });
                docker.on('error', () => {
                    failed.push(containerId);
                    resolve();
                });
            });
        }
        catch (err) {
            failed.push(containerId);
            if (verbose) {
                console.error(`❌ Failed to stop container ${containerId}: ${err}`);
            }
        }
    }
    return { stopped, failed };
}
/**
 * Main cleanup command implementation
 */
async function performCleanup(options) {
    const { force = false, verbose = false } = options;
    console.log('🧹 mcpmon cleanup utility');
    console.log('==========================\n');
    if (verbose) {
        console.log('🔍 Scanning for mcpmon processes and resources...\n');
    }
    // 1. Find mcpmon processes
    let mcpmonProcesses = [];
    try {
        mcpmonProcesses = await findMcpmonProcesses();
        if (verbose || mcpmonProcesses.length > 0) {
            console.log(`📋 Found ${mcpmonProcesses.length} mcpmon process(es):`);
            if (mcpmonProcesses.length > 0) {
                for (const proc of mcpmonProcesses) {
                    console.log(`  • PID ${proc.pid}: ${proc.fullCommand}`);
                }
            }
            console.log();
        }
    }
    catch (err) {
        console.error(`❌ Failed to scan for processes: ${err}`);
        if (!force) {
            process.exit(1);
        }
    }
    // 2. Find Docker containers
    let dockerContainers = [];
    try {
        dockerContainers = await findMcpmonDockerContainers();
        if (verbose || dockerContainers.length > 0) {
            console.log(`🐳 Found ${dockerContainers.length} potential Docker container(s):`);
            if (dockerContainers.length > 0) {
                for (const container of dockerContainers) {
                    console.log(`  • Container: ${container}`);
                }
            }
            console.log();
        }
    }
    catch (err) {
        if (verbose) {
            console.error(`⚠️  Failed to scan for Docker containers: ${err}`);
        }
    }
    // 3. Find orphaned Docker containers (containers whose mcpmon process has died)
    let orphanedContainers = [];
    try {
        orphanedContainers = await findOrphanedContainers(verbose);
        if (verbose || orphanedContainers.length > 0) {
            console.log(`🐳 Found ${orphanedContainers.length} orphaned Docker container(s):`);
            if (orphanedContainers.length > 0) {
                for (const container of orphanedContainers) {
                    console.log(`  • Container ${container.id.substring(0, 12)} (session: ${container.sessionId || 'unknown'}, dead PID: ${container.pid || 'unknown'}, started: ${container.startTime ? new Date(container.startTime).toLocaleString() : 'unknown'})`);
                }
            }
            console.log();
        }
    }
    catch (err) {
        if (verbose) {
            console.error(`⚠️  Failed to scan for orphaned containers: ${err}`);
        }
    }
    // Check if there's anything to clean up
    const hasWork = mcpmonProcesses.length > 0 || dockerContainers.length > 0 || orphanedContainers.length > 0;
    if (!hasWork) {
        console.log('✅ No mcpmon processes or containers found to clean up.');
        return;
    }
    // Ask for confirmation unless --force is used
    if (!force) {
        console.log('⚠️  This will terminate the following:');
        if (mcpmonProcesses.length > 0) {
            console.log(`   • ${mcpmonProcesses.length} mcpmon process(es)`);
        }
        if (dockerContainers.length > 0) {
            console.log(`   • ${dockerContainers.length} Docker container(s)`);
        }
        if (orphanedContainers.length > 0) {
            console.log(`   • ${orphanedContainers.length} orphaned Docker container(s)`);
        }
        console.log();
        // Simple confirmation (in a real implementation, you might want to use readline)
        console.log('❓ Proceed with cleanup? This operation cannot be undone.');
        console.log('💡 Use --force to skip this confirmation.');
        console.log('❌ Aborting cleanup. Use --force flag to proceed without confirmation.');
        return;
    }
    console.log('🚀 Starting cleanup...\n');
    // 5. Terminate processes
    if (mcpmonProcesses.length > 0) {
        console.log('🛑 Terminating mcpmon processes...');
        let terminated = 0;
        for (const proc of mcpmonProcesses) {
            const success = await terminateProcess(proc.pid, verbose);
            if (success) {
                terminated++;
                if (verbose) {
                    console.log(`✅ Terminated process ${proc.pid}`);
                }
            }
        }
        console.log(`✅ Terminated ${terminated}/${mcpmonProcesses.length} process(es)\n`);
    }
    // 6. Stop Docker containers
    if (dockerContainers.length > 0) {
        console.log('🐳 Stopping Docker containers...');
        const dockerResults = await stopDockerContainers(dockerContainers, verbose);
        console.log(`✅ Stopped ${dockerResults.stopped.length}/${dockerContainers.length} container(s)`);
        if (dockerResults.failed.length > 0) {
            console.log(`❌ Failed to stop ${dockerResults.failed.length} container(s)`);
        }
        console.log();
    }
    // 7. Clean up orphaned Docker containers
    if (orphanedContainers.length > 0) {
        console.log('🐳 Cleaning up orphaned Docker containers...');
        const orphanResults = await cleanupOrphanedContainers(orphanedContainers, verbose);
        console.log(`✅ Cleaned ${orphanResults.stopped.length}/${orphanedContainers.length} orphaned container(s)`);
        if (orphanResults.failed.length > 0) {
            console.log(`❌ Failed to clean ${orphanResults.failed.length} orphaned container(s)`);
        }
        console.log();
    }
    console.log('✅ Cleanup completed!');
    if (verbose) {
        console.log('\n💡 Summary:');
        console.log(`   • Processes terminated: ${mcpmonProcesses.length}`);
        console.log(`   • Containers stopped: ${dockerContainers.length}`);
        console.log(`   • Orphaned containers cleaned: ${orphanedContainers.length}`);
    }
}
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
    .option('--cleanup', 'Clean up orphaned mcpmon processes and resources')
    .option('--force', 'Skip confirmation prompts (use with --cleanup)')
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

Cleanup Examples:
  mcpmon --cleanup                                   # Scan and prompt for cleanup
  mcpmon --cleanup --force                           # Clean up without confirmation
  mcpmon --cleanup --verbose                         # Detailed cleanup logging
  mcpmon --cleanup --force --verbose                 # Force cleanup with details

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
    // Handle cleanup command (doesn't require a command)
    if (options.cleanup) {
        await performCleanup({
            force: options.force,
            verbose: options.verbose
        });
        return;
    }
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
        // mcpmon starting...
        // Command: ${command} ${args.join(" ")}
        if (watchTargets.length > 0) {
            // Watching: ${watchTargets.join(", ")}
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
                // Extensions enabled: ${enabled.map(e => e.name).join(', ')}
            }
            else {
                // No extensions enabled
            }
        }
    }
    catch (error) {
        // Failed to initialize extensions
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
    // Handle signals gracefully - register proxy shutdown handlers
    const shutdownHandler = async (signal) => {
        if (verbose) {
            console.error(`\n🛑 Received ${signal}, shutting down...`);
        }
        await proxy.shutdown();
        process.exit(0);
    };
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.on("SIGINT", () => shutdownHandler('SIGINT'));
    process.on("SIGTERM", () => shutdownHandler('SIGTERM'));
    // Start the proxy
    await proxy.start();
}
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
