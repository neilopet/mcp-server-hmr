/**
 * Deno implementation of ProcessManager interface
 *
 * Wraps Deno.Command to provide the ProcessManager interface,
 * handling platform-specific details like signal translation
 * and stream management.
 */
import { ManagedProcess, ProcessManager, SpawnOptions } from "../interfaces.ts";
/**
 * Deno implementation of ProcessManager
 *
 * Uses Deno.Command to spawn child processes with proper stdio configuration
 * for MCP server communication.
 */
export declare class DenoProcessManager implements ProcessManager {
    spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
}
export declare const denoProcessManager: DenoProcessManager;
//# sourceMappingURL=DenoProcessManager.d.ts.map