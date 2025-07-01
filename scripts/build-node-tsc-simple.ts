#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Build Node.js version using TypeScript compiler
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

console.log("📦 Building Node.js version using TypeScript compiler...");

await ensureDir("dist");
await ensureDir("dist/.build");

// Create tsconfig for Node.js
const tsconfig = {
  compilerOptions: {
    target: "ES2020",
    module: "commonjs",
    lib: ["ES2020"],
    outDir: "./dist/.build",
    rootDir: "./src",
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    removeComments: false,
    declaration: false,
    moduleResolution: "node",
    allowJs: true
  },
  include: ["src/main.ts", "src/config_launcher.ts"],
  exclude: ["src/**/*.test.ts"]
};

await Deno.writeTextFile("tsconfig.node.json", JSON.stringify(tsconfig, null, 2));

// Create a source file with imports replaced
async function prepareSourceFile(srcPath: string, destPath: string) {
  let content = await Deno.readTextFile(srcPath);
  
  // Remove Deno-specific imports
  content = content.replace(/^import\s+.*from\s+['"]https:\/\/deno\.land.*['"];?$/gm, '');
  content = content.replace(/^import\s+.*from\s+['"]std\/.*['"];?$/gm, '');
  content = content.replace(/^export\s+.*from\s+.*$/gm, '');
  
  // Remove load() call
  content = content.replace(/await\s+load\(\);?/g, '// load() removed for Node.js');
  
  // Replace import.meta.url
  content = content.replace(/import\.meta\.url/g, '__filename');
  
  // Add requires at top
  const requires = `
const { debounce } = require('./polyfills');
const parse = require('minimist');
const { resolve, join } = require('path');
const { existsSync } = require('./polyfills');
`;
  
  content = requires + '\n' + content;
  
  await Deno.writeTextFile(destPath, content);
}

// Prepare source files
await prepareSourceFile("src/main.ts", "dist/.build/main.ts");
await prepareSourceFile("src/config_launcher.ts", "dist/.build/config_launcher.ts");

// Create polyfills
const polyfills = `
exports.debounce = function(fn, delay) {
  let timeout = null;
  let lastCall = 0;
  
  const debounced = function(...args) {
    const now = Date.now();
    
    if (timeout) clearTimeout(timeout);
    
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
  
  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
};

exports.existsSync = function(filepath) {
  const fs = require('fs');
  try {
    fs.statSync(filepath);
    return true;
  } catch {
    return false;
  }
};
`;

await Deno.writeTextFile("dist/.build/polyfills.js", polyfills);

// Compile with TypeScript
console.log("📦 Compiling TypeScript...");
const compile = new Deno.Command("tsc", {
  args: ["--project", "tsconfig.node.json"],
  stdout: "inherit",
  stderr: "inherit"
});

const { code } = await compile.output();
if (code !== 0) {
  console.error("❌ TypeScript compilation failed");
  Deno.exit(1);
}

// Node.js runtime wrapper
const nodeWrapper = `#!/usr/bin/env node
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
  },
  stdin: {
    readable: process.stdin
  },
  stdout: process.stdout,
  stderr: process.stderr
};

// TextEncoder/TextDecoder
if (!global.TextEncoder) {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
}

// URL polyfill
global.URL = URL;

`;

// Create final files
async function wrapCompiledFile(compiledPath: string, outputPath: string) {
  const compiled = await Deno.readTextFile(compiledPath);
  const wrapped = nodeWrapper + '\n' + compiled;
  
  // For main.js, add startup code
  if (outputPath.includes('main')) {
    const startup = `
// Start if main module
if (require.main === module) {
  const proxy = new MCPProxy();
  
  // Handle shutdown signals
  process.on('SIGINT', () => proxy.shutdown());
  process.on('SIGTERM', () => proxy.shutdown());
  
  // Start the proxy
  proxy.start().catch(console.error);
}
`;
    await Deno.writeTextFile(outputPath, wrapped + startup);
  } else {
    // For config_launcher, wrap main code in async IIFE
    const wrappedWithAsync = wrapped.replace(
      /const args = parse\(Deno\.args/,
      `// Main execution
(async () => {
const args = parse(Deno.args`
    ) + '\n})().catch(console.error);\n';
    
    await Deno.writeTextFile(outputPath, wrappedWithAsync);
  }
  
  await Deno.chmod(outputPath, 0o755);
}

// Create final executables
await wrapCompiledFile("dist/.build/main.js", "dist/watch-main.js");
await wrapCompiledFile("dist/.build/config_launcher.js", "dist/watch-config.js");

// Copy polyfills
await Deno.copyFile("dist/.build/polyfills.js", "dist/polyfills.js");

// Create entry point
const entryPoint = `#!/usr/bin/env node
const args = process.argv.slice(2);

if (args.includes('--server') || args.includes('-s') || 
    args.includes('--list') || args.includes('-l') ||
    args.includes('--setup') || args.includes('--all') ||
    args.includes('--help') || args.includes('-h')) {
  require('./watch-config.js');
} else {
  require('./watch-main.js');
}
`;

await Deno.writeTextFile("dist/watch", entryPoint);
await Deno.chmod("dist/watch", 0o755);

// Create package.json
const packageJson = {
  name: "@neilopet/mcp-server-watch",
  version: "0.1.0",
  description: "Hot-reload for MCP servers (Node.js version)",
  bin: {
    "watch": "./watch"
  },
  dependencies: {
    "chokidar": "^3.5.3",
    "minimist": "^1.2.8"
  },
  engines: {
    "node": ">=14.0.0"
  }
};

await Deno.writeTextFile("dist/package.json", JSON.stringify(packageJson, null, 2));

// Clean up
await Deno.remove("tsconfig.node.json");
await Deno.remove("dist/.build", { recursive: true });

console.log("✅ Node.js build complete!");
console.log("\n📦 Usage:");
console.log("   cd dist && npm install");
console.log("   ./watch --help");