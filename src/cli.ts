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
import { NodeFileSystem } from "./node/NodeFileSystem.js";
import { NodeProcessManager } from "./node/NodeProcessManager.js";
import { MCPProxy } from "./proxy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function showHelp() {
  console.log(`
mcpmon - Hot-reload monitor for MCP servers

Usage:
  mcpmon <command> [args...]

Examples:
  mcpmon node server.js
  mcpmon python server.py
  mcpmon deno run server.ts
  mcpmon node --inspect server.js

Environment:
  MCPMON_WATCH     Override files/directories to watch (comma-separated)
  MCPMON_DELAY     Restart delay in milliseconds (default: 1000)
  MCPMON_VERBOSE   Enable verbose logging

Like nodemon, but for Model Context Protocol servers.
Automatically restarts your server when files change.
`);
}

function autoDetectWatchFile(command: string, args: string[]): string | null {
  // Look for the first file argument that looks like a script
  for (const arg of args) {
    // Skip flags
    if (arg.startsWith('-')) continue;
    
    const ext = extname(arg);
    
    // Common script extensions
    if (['.js', '.mjs', '.ts', '.py', '.rb', '.php'].includes(ext)) {
      return resolve(arg);
    }
  }
  
  return null;
}

function parseCommandLine(): { command: string; args: string[]; watchFile: string | null } {
  const argv = process.argv.slice(2);
  
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    showHelp();
    process.exit(0);
  }
  
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log('mcpmon 0.3.0');
    process.exit(0);
  }
  
  const command = argv[0];
  const args = argv.slice(1);
  
  // Auto-detect what file to watch
  let watchFile = autoDetectWatchFile(command, args);
  
  // Override with environment variable if provided
  if (process.env.MCPMON_WATCH) {
    const watchPaths = process.env.MCPMON_WATCH.split(',').map(p => p.trim());
    watchFile = watchPaths[0]; // Use first path for now
  }
  
  return { command, args, watchFile };
}

async function main() {
  const { command, args, watchFile } = parseCommandLine();
  
  if (process.env.MCPMON_VERBOSE) {
    console.error(`🔧 mcpmon starting...`);
    console.error(`📟 Command: ${command} ${args.join(' ')}`);
    if (watchFile) {
      console.error(`👀 Watching: ${watchFile}`);
    } else {
      console.error(`⚠️  No file to watch detected`);
    }
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
  const restartDelay = process.env.MCPMON_DELAY ? parseInt(process.env.MCPMON_DELAY) : 1000;
  
  const proxy = new MCPProxy(
    {
      procManager,
      fs,
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
    }
  );
  
  // Handle signals gracefully
  process.on('SIGINT', async () => {
    if (process.env.MCPMON_VERBOSE) {
      console.error(`\n🛑 Received SIGINT, shutting down...`);
    }
    await proxy.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    if (process.env.MCPMON_VERBOSE) {
      console.error(`\n🛑 Received SIGTERM, shutting down...`);
    }
    await proxy.shutdown();
    process.exit(0);
  });
  
  // Start the proxy
  await proxy.start();
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ mcpmon failed to start:', error.message);
  if (process.env.MCPMON_VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
});