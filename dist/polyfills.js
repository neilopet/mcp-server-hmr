
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

// Deno polyfills
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
  readTextFile: (filepath) => fs.promises.readFile(filepath, 'utf8'),
  writeTextFile: (filepath, data, opts) => {
    if (opts?.append) return fs.promises.appendFile(filepath, data);
    return fs.promises.writeFile(filepath, data);
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
  chmod: (filepath, mode) => fs.promises.chmod(filepath, mode),
  copyFile: (src, dest) => fs.promises.copyFile(src, dest),
  Command: class {
    constructor(cmd, options) {
      this.cmd = cmd;
      this.options = options || {};
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
      
      const createReader = (stream) => {
        if (!stream) return null;
        let buffer = [];
        let resolver = null;
        
        stream.on('data', (chunk) => {
          if (resolver) {
            resolver({ value: new Uint8Array(chunk), done: false });
            resolver = null;
          } else {
            buffer.push(chunk);
          }
        });
        
        stream.on('end', () => {
          if (resolver) resolver({ done: true });
        });
        
        return {
          getReader: () => ({
            read: () => new Promise((resolve) => {
              if (buffer.length > 0) {
                resolve({ value: new Uint8Array(buffer.shift()), done: false });
              } else {
                resolver = resolve;
              }
            })
          })
        };
      };
      
      return {
        pid: proc.pid,
        stdin: proc.stdin ? {
          getWriter: () => ({
            write: (data) => new Promise((resolve, reject) => {
              const buf = data instanceof Uint8Array ? Buffer.from(data) : data;
              proc.stdin.write(buf, (err) => err ? reject(err) : resolve());
            }),
            releaseLock: () => {}
          })
        } : null,
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
    
    watcher.on('all', (type, filepath) => {
      const kindMap = {
        'add': 'create',
        'change': 'modify',
        'unlink': 'remove'
      };
      
      const event = {
        kind: kindMap[type] || 'other',
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
  addSignalListener: (signal, handler) => process.on(signal, handler)
};

// TextEncoder/TextDecoder
global.TextEncoder = global.TextEncoder || require('util').TextEncoder;
global.TextDecoder = global.TextDecoder || require('util').TextDecoder;

// Std library replacements
global.__denoStd = {
  debounce: function(fn, delay) {
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
  },
  DebouncedFunction: function() {},
  parse: require('minimist'),
  existsSync: (filepath) => {
    try { 
      fs.statSync(filepath); 
      return true; 
    } catch { 
      return false; 
    }
  },
  resolve: path.resolve,
  join: path.join,
  ensureDir: async (dir) => {
    await fs.promises.mkdir(dir, { recursive: true });
  },
  homedir: () => process.env.HOME || process.env.USERPROFILE || ''
};
