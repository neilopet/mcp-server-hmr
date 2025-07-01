#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Simplified Node.js build - minimal TypeScript transformation
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

console.log("📦 Building Node.js version (simplified)...");

await ensureDir("dist");

// Read source files
const mainSource = await Deno.readTextFile("src/main.ts");
const configSource = await Deno.readTextFile("src/config_launcher.ts");

// Very simple TypeScript to JavaScript transformation
function transformToJS(source: string, filename: string): string {
  let js = source;
  
  // Remove shebang
  js = js.replace(/^#!.*$/gm, '');
  
  // Remove TypeScript-only imports
  js = js.replace(/^import\s+type\s+.*$/gm, '');
  js = js.replace(/^import\s+.*from\s+['"]https:\/\/deno\.land.*['"];?$/gm, '');
  js = js.replace(/^import\s+.*from\s+['"]std\/.*['"];?$/gm, '');
  js = js.replace(/^export\s+.*from\s+.*$/gm, '');
  
  // Remove interfaces and type declarations
  js = js.replace(/^export\s+interface\s+\w+\s*{[\s\S]*?^}/gm, '');
  js = js.replace(/^interface\s+\w+\s*{[\s\S]*?^}/gm, '');
  js = js.replace(/^export\s+type\s+.*$/gm, '');
  js = js.replace(/^type\s+.*$/gm, '');
  
  // Remove export keywords but keep declarations
  js = js.replace(/^export\s+(async\s+)?function/gm, '$1function');
  js = js.replace(/^export\s+(const|let|var)/gm, '$1');
  js = js.replace(/^export\s+class/gm, 'class');
  
  // Remove function parameter types
  js = js.replace(/function\s+(\w+)\s*\(([^)]*)\)/g, (match, name, params) => {
    const cleanParams = params.split(',').map(param => {
      // Remove type annotation but keep parameter name
      return param.replace(/(\w+)\s*\??\s*:\s*[^,)]+/, '$1');
    }).join(',');
    return `function ${name}(${cleanParams})`;
  });
  
  // Remove arrow function parameter types
  js = js.replace(/\(([^)]*)\)\s*=>/g, (match, params) => {
    const cleanParams = params.split(',').map(param => {
      return param.replace(/(\w+)\s*\??\s*:\s*[^,)]+/, '$1');
    }).join(',');
    return `(${cleanParams}) =>`;
  });
  
  // Remove function return types
  js = js.replace(/\)\s*:\s*[^{]+\s*{/g, ') {');
  
  // Remove variable type annotations
  js = js.replace(/(const|let|var)\s+(\w+)\s*:\s*[^=;]+\s*=/g, '$1 $2 =');
  js = js.replace(/(const|let|var)\s+(\w+)\s*:\s*[^;]+;/g, '$1 $2;');
  
  // Remove generic types
  js = js.replace(/\w+<[^>]+>/g, match => match.split('<')[0]);
  
  // Simple type annotation removal
  js = js.replace(/:\s*string\[\]/g, '');
  js = js.replace(/:\s*number\[\]/g, '');
  js = js.replace(/:\s*boolean\[\]/g, '');
  js = js.replace(/:\s*any\[\]/g, '');
  js = js.replace(/:\s*string/g, '');
  js = js.replace(/:\s*number/g, '');
  js = js.replace(/:\s*boolean/g, '');
  js = js.replace(/:\s*any/g, '');
  js = js.replace(/:\s*void/g, '');
  js = js.replace(/:\s*unknown/g, '');
  js = js.replace(/:\s*never/g, '');
  
  // Remove type assertions
  js = js.replace(/\s+as\s+\w+/g, '');
  js = js.replace(/<\w+>/g, '');
  
  // Replace import.meta.url
  js = js.replace(/import\.meta\.url/g, '__filename');
  
  // For config_launcher, wrap main execution
  if (filename === 'config_launcher') {
    const lines = js.split('\n');
    let mainStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('const args = parse(Deno.args')) {
        mainStart = i;
        break;
      }
    }
    
    if (mainStart > 0) {
      const beforeMain = lines.slice(0, mainStart);
      const afterMain = lines.slice(mainStart);
      
      js = beforeMain.join('\n') + '\n\n// Main execution\n(async () => {\n' + 
           afterMain.join('\n') + '\n})().catch(console.error);\n';
    }
  }
  
  return js;
}

// Node.js polyfills
const nodePolyfills = `#!/usr/bin/env node
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
`;

// Create Node.js versions
const mainJS = nodePolyfills + '\n\n// Transformed from src/main.ts\n' + transformToJS(mainSource, 'main') + `

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

const configJS = nodePolyfills + '\n\n// Transformed from src/config_launcher.ts\n' + transformToJS(configSource, 'config_launcher');

// Write files
await Deno.writeTextFile("dist/watch-main.js", mainJS);
await Deno.writeTextFile("dist/watch-config.js", configJS);
await Deno.chmod("dist/watch-main.js", 0o755);
await Deno.chmod("dist/watch-config.js", 0o755);

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

console.log("✅ Node.js build complete!");
console.log("\n📦 Usage:");
console.log("   cd dist && npm install");
console.log("   ./watch --help");