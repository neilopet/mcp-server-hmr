#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-net
/**
 * Build script to create Node.js compatible version
 * Uses esbuild to bundle TypeScript into JavaScript
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.20.1/mod.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.10.3/mod.ts";

console.log("🔨 Building Node.js compatible version...");

// Ensure dist directory exists
await ensureDir("dist");

// Create Node.js shim for Deno APIs
const nodeShim = `
// Node.js compatibility shim for Deno APIs
global.Deno = global.Deno || {};

// Shim Deno.args with process.argv
Deno.args = process.argv.slice(2);

// Shim Deno.env
Deno.env = {
  get: (key) => process.env[key],
  set: (key, value) => { process.env[key] = value; },
  toObject: () => ({ ...process.env })
};

// Shim Deno.build
Deno.build = {
  os: process.platform === 'darwin' ? 'darwin' : 
      process.platform === 'win32' ? 'windows' : 'linux'
};

// Shim Deno.exit
Deno.exit = process.exit;

// Shim basic file operations
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

Deno.readTextFile = (path) => fs.promises.readFile(path, 'utf8');
Deno.writeTextFile = (path, data, opts) => {
  if (opts?.append) {
    return fs.promises.appendFile(path, data);
  }
  return fs.promises.writeFile(path, data);
};

Deno.stat = (path) => fs.promises.stat(path);
Deno.chmod = (path, mode) => fs.promises.chmod(path, mode);
Deno.copyFile = (src, dest) => fs.promises.copyFile(src, dest);

// Shim Deno.Command (basic implementation)
Deno.Command = class Command {
  constructor(cmd, options) {
    this.cmd = cmd;
    this.options = options || {};
  }
  
  spawn() {
    const child = spawn(this.cmd, this.options.args || [], {
      stdio: [
        this.options.stdin === 'piped' ? 'pipe' : 'inherit',
        this.options.stdout === 'piped' ? 'pipe' : 'inherit',
        this.options.stderr === 'piped' ? 'pipe' : 'inherit',
      ],
      env: this.options.env || process.env,
      cwd: this.options.cwd
    });
    
    // Wrap Node child process to match Deno API
    return {
      pid: child.pid,
      stdin: child.stdin ? {
        getWriter: () => ({
          write: (data) => new Promise((resolve, reject) => {
            child.stdin.write(data, (err) => err ? reject(err) : resolve());
          }),
          releaseLock: () => {}
        })
      } : null,
      stdout: child.stdout ? {
        getReader: () => ({
          read: () => new Promise((resolve) => {
            child.stdout.once('data', (data) => {
              resolve({ value: new Uint8Array(data), done: false });
            });
            child.stdout.once('end', () => {
              resolve({ done: true });
            });
          })
        })
      } : null,
      stderr: child.stderr ? {
        getReader: () => ({
          read: () => new Promise((resolve) => {
            child.stderr.once('data', (data) => {
              resolve({ value: new Uint8Array(data), done: false });
            });
            child.stderr.once('end', () => {
              resolve({ done: true });
            });
          })
        })
      } : null,
      status: new Promise((resolve) => {
        child.on('exit', (code) => resolve({ code }));
      }),
      kill: (signal) => child.kill(signal)
    };
  }
  
  output() {
    // Simplified output method for synchronous execution
    const { execSync } = require('child_process');
    try {
      const output = execSync(\`\${this.cmd} \${(this.options.args || []).join(' ')}\`, {
        env: this.options.env || process.env,
        cwd: this.options.cwd
      });
      return Promise.resolve({ stdout: output, success: true });
    } catch (error) {
      return Promise.resolve({ success: false, stderr: error.stderr });
    }
  }
};

// Shim Deno.watchFs
const chokidar = require('chokidar');
Deno.watchFs = (paths) => {
  const watcher = chokidar.watch(paths, { persistent: true });
  
  return {
    [Symbol.asyncIterator]() {
      const events = [];
      let resolver = null;
      
      watcher.on('all', (eventType, path) => {
        const event = {
          kind: eventType === 'add' ? 'create' :
                eventType === 'change' ? 'modify' :
                eventType === 'unlink' ? 'remove' : 'other',
          paths: [path]
        };
        
        if (resolver) {
          resolver({ value: event, done: false });
          resolver = null;
        } else {
          events.push(event);
        }
      });
      
      return {
        async next() {
          if (events.length > 0) {
            return { value: events.shift(), done: false };
          }
          
          return new Promise((resolve) => {
            resolver = resolve;
          });
        }
      };
    },
    close: () => watcher.close()
  };
};

// Shim TextEncoder/TextDecoder (native in Node 11+)
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
}

// Shim Deno.addSignalListener
Deno.addSignalListener = (signal, handler) => {
  process.on(signal, handler);
};
`;

// Write Node.js shim
await Deno.writeTextFile("dist/deno-shim.js", nodeShim);

try {
  // Bundle main.ts
  const mainResult = await build({
    plugins: [...denoPlugins()],
    entryPoints: ["src/main.ts"],
    outfile: "dist/watch-main.js",
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node14",
    banner: {
      js: `#!/usr/bin/env node\nrequire('./deno-shim.js');\n`
    },
  });

  // Bundle config_launcher.ts
  const configResult = await build({
    plugins: [...denoPlugins()],
    entryPoints: ["src/config_launcher.ts"],
    outfile: "dist/watch-config.js",
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node14",
    banner: {
      js: `#!/usr/bin/env node\nrequire('./deno-shim.js');\n`
    },
  });

  // Create main watch script for Node
  const watchScript = `#!/usr/bin/env node
/**
 * MCP Server Watch - Node.js entry point
 * Hot-reload wrapper for MCP servers
 */

const path = require('path');
const { spawn } = require('child_process');

// Parse arguments to determine which script to run
const args = process.argv.slice(2);

// If config-based arguments, use config launcher
if (args.includes('--server') || args.includes('-s') || 
    args.includes('--list') || args.includes('-l') ||
    args.includes('--setup') || args.includes('--all') ||
    args.includes('--help') || args.includes('-h')) {
  require('./watch-config.js');
} else {
  // Direct command mode
  require('./watch-main.js');
}
`;

  await Deno.writeTextFile("dist/watch", watchScript);
  await Deno.chmod("dist/watch", 0o755);

  // Create package.json for Node.js dependencies
  const packageJson = {
    name: "mcp-server-watch",
    version: "0.1.0",
    description: "Hot-reload wrapper for MCP servers (Node.js build)",
    bin: {
      "watch": "./watch"
    },
    dependencies: {
      "chokidar": "^3.5.3"
    },
    engines: {
      "node": ">=14.0.0"
    }
  };

  await Deno.writeTextFile("dist/package.json", JSON.stringify(packageJson, null, 2));

  // Create installation instructions
  const nodeReadme = `# MCP Server Watch - Node.js Version

This is the Node.js compatible build of MCP Server Watch.

## Installation

\`\`\`bash
cd dist
npm install
npm link  # Makes 'watch' command available globally
\`\`\`

## Usage

Same as the Deno version:

\`\`\`bash
# Direct mode
watch node /path/to/mcp-server.js

# Config mode  
watch --list
watch --server my-server
watch --setup my-server
\`\`\`

## Notes

- This is a bundled version generated from TypeScript/Deno source
- Some features may have limitations compared to the Deno version
- File watching uses chokidar instead of Deno.watchFs
`;

  await Deno.writeTextFile("dist/README.md", nodeReadme);

  console.log("✅ Node.js build complete!");
  console.log("\n📦 Output files:");
  console.log("   dist/watch           - Main executable");
  console.log("   dist/watch-main.js   - Direct mode bundle");
  console.log("   dist/watch-config.js - Config mode bundle");
  console.log("   dist/deno-shim.js    - Deno API compatibility");
  console.log("   dist/package.json    - Node dependencies");
  console.log("   dist/README.md       - Usage instructions");
  console.log("\n💡 To use the Node.js version:");
  console.log("   cd dist && npm install");
  console.log("   ./watch --help");

} catch (error) {
  console.error("❌ Build failed:", error);
  Deno.exit(1);
} finally {
  stop();
}