/**
 * Node.js implementation of ProcessManager interface
 *
 * Wraps Node.js child_process to provide the ProcessManager interface,
 * handling platform-specific details like signal translation, stream
 * conversion to Web Streams API, and process cleanup.
 */
import { ManagedProcess, ProcessManager, SpawnOptions } from "../interfaces.js";
/**
 * Node.js implementation of ProcessManager
 *
 * Uses Node.js child_process.spawn to create child processes with proper
 * stdio configuration for MCP server communication.
 */
export declare class NodeProcessManager implements ProcessManager {
    spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
}
export declare const nodeProcessManager: NodeProcessManager;
//# sourceMappingURL=NodeProcessManager.d.ts.map