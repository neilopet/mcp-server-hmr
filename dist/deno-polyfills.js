
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
  readTextFile: (path) => fs.promises.readFile(path, 'utf8'),
  writeTextFile: (path, data, opts) => {
    if (opts?.append) return fs.promises.appendFile(path, data);
    return fs.promises.writeFile(path, data);
  },
  stat: async (path) => {
    const stats = await fs.promises.stat(path);
    return { isFile: stats.isFile(), isDirectory: stats.isDirectory() };
  },
  chmod: (path, mode) => fs.promises.chmod(path, mode),
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
        cwd: this.options.cwd
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
              proc.stdin.write(Buffer.from(data), (err) => err ? reject(err) : resolve());
            }),
            releaseLock: () => {}
          })
        } : null,
        stdout: createReader(proc.stdout),
        stderr: createReader(proc.stderr),
        status: new Promise((resolve) => {
          proc.on('exit', (code) => resolve({ code }));
        }),
        kill: (signal) => proc.kill(signal)
      };
    }
  },
  watchFs: (paths) => {
    const watcher = chokidar.watch(paths, { persistent: true, ignoreInitial: true });
    const events = [];
    let resolver = null;
    
    watcher.on('all', (type, path) => {
      const event = {
        kind: type === 'add' ? 'create' : type === 'change' ? 'modify' : 'remove',
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

// Export stubs for Deno std
module.exports.debounce = function(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};
module.exports.parse = require('minimist');
module.exports.existsSync = (path) => {
  try { fs.statSync(path); return true; } catch { return false; }
};
module.exports.resolve = path.resolve;
module.exports.join = path.join;
module.exports.homedir = () => process.env.HOME || process.env.USERPROFILE;
