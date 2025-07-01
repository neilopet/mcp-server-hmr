#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run
/**
 * MCP Server HMR
 *
 * Hot Module Replacement for MCP servers - instant reloading on file changes.
 * Configure via environment variables in .env file.
 */
import { load } from "std/dotenv/mod.ts";
import { MCPProxy } from "./proxy.ts";
import { DenoProcessManager } from "./deno/DenoProcessManager.ts";
import { DenoFileSystem } from "./deno/DenoFileSystem.ts";
// Check if we have command line arguments (for testing) or use environment variables (for production)
// Note: We check command line args first before loading .env to avoid env validation errors in test mode
let command;
let commandArgs = [];
let entryFile = null;
let restartDelay = 300;
if (Deno.args.length > 0) {
    // Command line mode (for testing)
    console.error("🧪 Using command line arguments mode");
    let i = 0;
    command = Deno.args[i++];
    while (i < Deno.args.length) {
        commandArgs.push(Deno.args[i++]);
    }
    // Determine entry file for command line mode
    if (command === "node" && commandArgs.length > 0) {
        entryFile = commandArgs[0];
    }
    else if (command === "deno" && commandArgs.includes("run")) {
        const runIndex = commandArgs.indexOf("run");
        for (let j = runIndex + 1; j < commandArgs.length; j++) {
            if (!commandArgs[j].startsWith("-")) {
                entryFile = commandArgs[j];
                break;
            }
        }
    }
    else if (command === "python" && commandArgs.length > 0) {
        entryFile = commandArgs[0];
    }
}
else {
    // Environment variable mode (for production)
    console.error("🔧 Using environment variables mode");
    // Load environment variables from .env file (only in env mode)
    // Allow empty values for optional variables and export them to Deno.env
    await load({ export: true, allowEmptyValues: true });
    const serverCommand = Deno.env.get("MCP_SERVER_COMMAND");
    const serverArgs = Deno.env.get("MCP_SERVER_ARGS");
    const watchFile = Deno.env.get("MCP_WATCH_FILE");
    restartDelay = parseInt(Deno.env.get("MCP_RESTART_DELAY") || "300");
    // Validate required configuration
    if (!serverCommand) {
        console.error("❌ MCP_SERVER_COMMAND environment variable is required");
        console.error("💡 Copy .env.example to .env and configure your server");
        Deno.exit(1);
    }
    if (!serverArgs) {
        console.error("❌ MCP_SERVER_ARGS environment variable is required");
        console.error("💡 Set the path to your MCP server script");
        Deno.exit(1);
    }
    command = serverCommand;
    commandArgs = serverArgs.split(" ").filter((arg) => arg.trim() !== "");
    entryFile = watchFile || null;
}
if (!entryFile) {
    // Auto-detect entry file based on command
    if (command === "node" && commandArgs.length > 0) {
        entryFile = commandArgs[commandArgs.length - 1]; // Last arg for node
    }
    else if (command === "deno" && commandArgs.includes("run")) {
        const runIndex = commandArgs.indexOf("run");
        for (let j = runIndex + 1; j < commandArgs.length; j++) {
            if (!commandArgs[j].startsWith("-")) {
                entryFile = commandArgs[j];
                break;
            }
        }
    }
    else if (command === "python" && commandArgs.length > 0) {
        entryFile = commandArgs[commandArgs.length - 1]; // Last arg for python
    }
}
console.error(`🚀 Starting MCP Server HMR`);
console.error(`📟 Server: ${command} ${commandArgs.join(" ")}`);
if (entryFile) {
    console.error(`👀 Watching: ${entryFile}`);
}
else {
    console.error(`⚠️  No entry file detected - hot-reload disabled`);
}
// Create and start proxy with Deno implementations
const proxy = new MCPProxy({
    procManager: new DenoProcessManager(),
    fs: new DenoFileSystem(),
    stdin: Deno.stdin.readable,
    stdout: Deno.stdout.writable,
    stderr: Deno.stderr.writable,
    exit: (code) => Deno.exit(code),
}, {
    command,
    commandArgs,
    entryFile,
    restartDelay,
    env: Deno.env.toObject(),
    killDelay: 1000, // Production timing
    readyDelay: 2000, // Production timing
});
// Handle shutdown signals
Deno.addSignalListener("SIGINT", async () => {
    await proxy.shutdown();
    Deno.exit(0);
});
Deno.addSignalListener("SIGTERM", async () => {
    await proxy.shutdown();
    Deno.exit(0);
});
// Start the proxy
await proxy.start();
