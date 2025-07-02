/**
 * Node.js implementation of ProcessManager interface
 *
 * Wraps Node.js child_process to provide the ProcessManager interface,
 * handling platform-specific details like signal translation, stream
 * conversion to Web Streams API, and process cleanup.
 */

import { spawn, ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import { ExitStatus, ManagedProcess, ProcessManager, SpawnOptions } from "../interfaces.js";

/**
 * Helper function to convert Node.js Readable stream to Web ReadableStream
 */
function toWebReadableStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (error) => {
        controller.error(error);
      });
    },

    cancel() {
      nodeStream.destroy();
    },
  });
}

/**
 * Helper function to convert Node.js Writable stream to Web WritableStream
 */
function toWebWritableStream(nodeStream: Writable): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        nodeStream.write(chunk, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },

    close() {
      return new Promise((resolve, reject) => {
        nodeStream.end((error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },

    abort(reason) {
      nodeStream.destroy(reason);
    },
  });
}

/**
 * Wraps a Node.js ChildProcess to implement the ManagedProcess interface
 */
class NodeManagedProcess implements ManagedProcess {
  private child: ChildProcess;
  private _status: Promise<ExitStatus>;

  constructor(child: ChildProcess) {
    this.child = child;

    // Create the status promise immediately
    this._status = new Promise((resolve, reject) => {
      this.child.on("exit", (code, signal) => {
        resolve({
          code: code,
          signal: signal,
        });
      });

      this.child.on("error", (error: Error) => {
        // Check for common spawn errors
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(`Command not found: ${(this.child as any).spawnargs?.[0] || "unknown"}`)
          );
        } else {
          reject(new Error(`Failed to spawn process: ${error.message}`));
        }
      });
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get stdin(): WritableStream<Uint8Array> {
    if (!this.child.stdin) {
      throw new Error("Process stdin is not available");
    }
    return toWebWritableStream(this.child.stdin);
  }

  get stdout(): ReadableStream<Uint8Array> {
    if (!this.child.stdout) {
      throw new Error("Process stdout is not available");
    }
    return toWebReadableStream(this.child.stdout);
  }

  get stderr(): ReadableStream<Uint8Array> {
    if (!this.child.stderr) {
      throw new Error("Process stderr is not available");
    }
    return toWebReadableStream(this.child.stderr);
  }

  get status(): Promise<ExitStatus> {
    return this._status;
  }

  kill(signal?: string): boolean {
    try {
      // Default to SIGTERM if no signal specified
      const sig = signal || "SIGTERM";

      // Node.js kill method returns boolean indicating success
      // Cast to NodeJS.Signals for type compatibility
      const result = this.child.kill(sig as NodeJS.Signals);

      // For Windows compatibility, if SIGTERM fails, try SIGKILL
      if (!result && process.platform === "win32" && sig === "SIGTERM") {
        return this.child.kill("SIGKILL");
      }

      return result;
    } catch (error) {
      // Log the error but don't throw - matches expected behavior
      console.error(`Failed to kill process ${this.pid}: ${(error as Error).message}`);
      return false;
    }
  }
}

/**
 * Node.js implementation of ProcessManager
 *
 * Uses Node.js child_process.spawn to create child processes with proper
 * stdio configuration for MCP server communication.
 */
export class NodeProcessManager implements ProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
    try {
      // Build Node.js spawn options
      const nodeOptions: Parameters<typeof spawn>[2] = {
        stdio: ["pipe", "pipe", "pipe"],
      };

      // Add environment variables if provided
      if (options?.env) {
        nodeOptions.env = { ...process.env, ...options.env };
      }

      // Add working directory if provided
      if (options?.cwd) {
        nodeOptions.cwd = options.cwd;
      }

      // Create the child process
      const child = spawn(command, args, nodeOptions);

      // Note: spawn errors are handled in NodeManagedProcess via the status promise

      return new NodeManagedProcess(child);
    } catch (error) {
      // Convert Node.js errors to standard Error format
      throw new Error(`Failed to spawn process '${command}': ${(error as Error).message}`);
    }
  }
}

// Export a default instance for convenience
export const nodeProcessManager = new NodeProcessManager();
