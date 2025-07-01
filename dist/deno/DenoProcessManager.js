/**
 * Deno implementation of ProcessManager interface
 *
 * Wraps Deno.Command to provide the ProcessManager interface,
 * handling platform-specific details like signal translation
 * and stream management.
 */
/**
 * Wraps a Deno ChildProcess to implement the ManagedProcess interface
 */
class DenoManagedProcess {
    child;
    constructor(child) {
        this.child = child;
    }
    get pid() {
        return this.child.pid;
    }
    get stdin() {
        return this.child.stdin;
    }
    get stdout() {
        return this.child.stdout;
    }
    get stderr() {
        return this.child.stderr;
    }
    get status() {
        return this.child.status.then((status) => ({
            code: status.code,
            signal: status.signal,
        }));
    }
    kill(signal) {
        try {
            // Default to SIGTERM if no signal specified
            const sig = signal || "SIGTERM";
            // Normalize signal name - Deno expects full signal names like "SIGTERM"
            let denoSignal;
            if (sig.startsWith("SIG")) {
                // Already has SIG prefix - use as is
                denoSignal = sig;
            }
            else {
                // Add SIG prefix (e.g., "TERM" -> "SIGTERM")
                denoSignal = "SIG" + sig;
            }
            this.child.kill(denoSignal);
            return true;
        }
        catch (error) {
            // Log the error but don't throw - matches expected behavior
            console.error(`Failed to kill process ${this.pid}: ${error.message}`);
            return false;
        }
    }
}
/**
 * Deno implementation of ProcessManager
 *
 * Uses Deno.Command to spawn child processes with proper stdio configuration
 * for MCP server communication.
 */
export class DenoProcessManager {
    spawn(command, args, options) {
        try {
            // Build Deno command options
            const denoOptions = {
                args,
                stdin: "piped",
                stdout: "piped",
                stderr: "piped",
            };
            // Add environment variables if provided
            if (options?.env) {
                denoOptions.env = options.env;
            }
            // Add working directory if provided
            if (options?.cwd) {
                denoOptions.cwd = options.cwd;
            }
            // Create and spawn the command
            const command_instance = new Deno.Command(command, denoOptions);
            const child = command_instance.spawn();
            return new DenoManagedProcess(child);
        }
        catch (error) {
            // Convert Deno errors to standard Error format
            throw new Error(`Failed to spawn process '${command}': ${error.message}`);
        }
    }
}
// Export a default instance for convenience
export const denoProcessManager = new DenoProcessManager();
