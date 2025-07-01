/**
 * Node.js implementation of ProcessManager interface
 *
 * Wraps Node.js child_process to provide the ProcessManager interface,
 * handling platform-specific details like signal translation, stream
 * conversion to Web Streams API, and process cleanup.
 */
import { spawn } from "child_process";
/**
 * Helper function to convert Node.js Readable stream to Web ReadableStream
 */
function toWebReadableStream(nodeStream) {
    return new ReadableStream({
        start(controller) {
            nodeStream.on("data", (chunk) => {
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
function toWebWritableStream(nodeStream) {
    return new WritableStream({
        write(chunk) {
            return new Promise((resolve, reject) => {
                nodeStream.write(chunk, (error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                nodeStream.end((error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
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
class NodeManagedProcess {
    child;
    _status;
    constructor(child) {
        this.child = child;
        // Create the status promise immediately
        this._status = new Promise((resolve) => {
            this.child.on("exit", (code, signal) => {
                resolve({
                    code: code,
                    signal: signal,
                });
            });
        });
    }
    get pid() {
        return this.child.pid;
    }
    get stdin() {
        if (!this.child.stdin) {
            throw new Error("Process stdin is not available");
        }
        return toWebWritableStream(this.child.stdin);
    }
    get stdout() {
        if (!this.child.stdout) {
            throw new Error("Process stdout is not available");
        }
        return toWebReadableStream(this.child.stdout);
    }
    get stderr() {
        if (!this.child.stderr) {
            throw new Error("Process stderr is not available");
        }
        return toWebReadableStream(this.child.stderr);
    }
    get status() {
        return this._status;
    }
    kill(signal) {
        try {
            // Default to SIGTERM if no signal specified
            const sig = signal || "SIGTERM";
            // Node.js kill method returns boolean indicating success
            // Cast to NodeJS.Signals for type compatibility
            const result = this.child.kill(sig);
            // For Windows compatibility, if SIGTERM fails, try SIGKILL
            if (!result && process.platform === "win32" && sig === "SIGTERM") {
                return this.child.kill("SIGKILL");
            }
            return result;
        }
        catch (error) {
            // Log the error but don't throw - matches expected behavior
            console.error(`Failed to kill process ${this.pid}: ${error.message}`);
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
export class NodeProcessManager {
    spawn(command, args, options) {
        try {
            // Build Node.js spawn options
            const nodeOptions = {
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
            // Handle spawn errors
            child.on("error", (error) => {
                // Check for common spawn errors
                if (error.code === "ENOENT") {
                    throw new Error(`Command not found: ${command}`);
                }
                else {
                    throw new Error(`Failed to spawn process '${command}': ${error.message}`);
                }
            });
            return new NodeManagedProcess(child);
        }
        catch (error) {
            // Convert Node.js errors to standard Error format
            throw new Error(`Failed to spawn process '${command}': ${error.message}`);
        }
    }
}
// Export a default instance for convenience
export const nodeProcessManager = new NodeProcessManager();
