#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Simple build script to create Node.js wrapper
 * Creates a Node.js entry point that calls Deno
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

console.log("🔨 Building Node.js wrapper...");

// Ensure dist directory exists
await ensureDir("dist");

// Create Node.js wrapper script
const nodeWrapper = `#!/usr/bin/env node
/**
 * MCP Server Watch - Node.js Wrapper
 * 
 * This wrapper allows using the watch command from Node.js environments
 * by calling Deno under the hood. Requires Deno to be installed.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if Deno is installed
const checkDeno = spawn('deno', ['--version'], { 
  stdio: 'pipe',
  shell: process.platform === 'win32' 
});

checkDeno.on('error', () => {
  console.error('❌ Deno is required to run MCP Server Watch');
  console.error('');
  console.error('Install Deno:');
  console.error('  curl -fsSL https://deno.land/install.sh | sh');
  console.error('  or');
  console.error('  brew install deno');
  console.error('');
  console.error('See https://deno.land for more installation options');
  process.exit(1);
});

checkDeno.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ Failed to run Deno. Is it installed and in PATH?');
    process.exit(1);
  }
  
  // Deno is available, run the actual command
  runWatch();
});

function runWatch() {
  // Get the directory of this script
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, '..');
  
  // Parse arguments to determine which script to run
  const args = process.argv.slice(2);
  
  let targetScript;
  let denoArgs = ['run', '--allow-env', '--allow-read', '--allow-run'];
  
  // If config-based arguments, use config launcher
  if (args.includes('--server') || args.includes('-s') || 
      args.includes('--list') || args.includes('-l') ||
      args.includes('--setup') || args.includes('--all') ||
      args.includes('--help') || args.includes('-h')) {
    targetScript = path.join(projectRoot, 'src', 'config_launcher.ts');
    denoArgs.push('--allow-write'); // Needed for --setup
  } else {
    // Direct command mode
    targetScript = path.join(projectRoot, 'src', 'main.ts');
  }
  
  denoArgs.push(targetScript);
  denoArgs.push(...args);
  
  // Run Deno with the appropriate script
  const deno = spawn('deno', denoArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  
  deno.on('error', (err) => {
    console.error('Failed to run Deno:', err);
    process.exit(1);
  });
  
  deno.on('close', (code) => {
    process.exit(code || 0);
  });
  
  // Forward signals to Deno process
  process.on('SIGINT', () => deno.kill('SIGINT'));
  process.on('SIGTERM', () => deno.kill('SIGTERM'));
}
`;

await Deno.writeTextFile("dist/watch", nodeWrapper);
await Deno.chmod("dist/watch", 0o755);

// Create a simple package.json
const packageJson = {
  name: "mcp-server-watch",
  version: "0.1.0",
  description: "Hot-reload wrapper for MCP servers",
  bin: {
    "watch": "./watch"
  },
  engines: {
    "node": ">=14.0.0"
  },
  scripts: {
    "postinstall": "echo '\\n✅ MCP Server Watch installed! Requires Deno to run.\\n'"
  }
};

await Deno.writeTextFile("dist/package.json", JSON.stringify(packageJson, null, 2));

// Create README for Node.js users
const readme = `# MCP Server Watch - Node.js Wrapper

This is a Node.js wrapper for MCP Server Watch that requires Deno to be installed.

## Requirements

- Node.js 14+
- Deno (https://deno.land)

## Installation

\`\`\`bash
npm install -g .
# or
npm link
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

## Why Deno is Required

MCP Server Watch is built with Deno for:
- Better TypeScript support
- Built-in file watching
- Secure subprocess management
- No node_modules complexity

The Node.js wrapper simply calls Deno under the hood, providing a familiar \`npm install\` experience while leveraging Deno's capabilities.
`;

await Deno.writeTextFile("dist/README.md", readme);

console.log("✅ Node.js wrapper build complete!");
console.log("\n📦 Output files:");
console.log("   dist/watch        - Node.js wrapper script");
console.log("   dist/package.json - NPM package manifest");
console.log("   dist/README.md    - Usage instructions");
console.log("\n💡 To install globally:");
console.log("   cd dist && npm link");
console.log("\n⚠️  Note: This wrapper requires Deno to be installed");