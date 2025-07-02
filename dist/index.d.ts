/**
 * mcpmon - Hot-reload monitor for MCP servers (Node.js) - Library Entry Point
 *
 * This package provides hot-reload capabilities for MCP (Model Context Protocol) servers.
 * It offers both a CLI tool and programmatic API for integrating hot-reload functionality
 * into your MCP server development workflow.
 *
 * @example CLI Usage
 * ```bash
 * # Install globally
 * npm install -g mcpmon
 *
 * # Simple nodemon-like usage
 * mcpmon node server.js
 * mcpmon python server.py
 * mcpmon deno run --allow-all server.ts
 * ```
 *
 * @example Programmatic Usage
 * ```typescript
 * import { MCPProxy, NodeProcessManager, NodeFileSystem } from 'mcpmon';
 *
 * // Create a helper function for easy setup
 * function createMCPProxy(config: {
 *   command: string;
 *   args: string[];
 *   watchFile?: string;
 *   restartDelay?: number;
 * }) {
 *   const procManager = new NodeProcessManager();
 *   const fs = new NodeFileSystem();
 *
 *   const dependencies = {
 *     procManager,
 *     fs,
 *     stdin: new ReadableStream({
 *       start(controller) {
 *         process.stdin.on('data', (chunk) => {
 *           controller.enqueue(new Uint8Array(chunk));
 *         });
 *         process.stdin.on('end', () => controller.close());
 *       },
 *     }),
 *     stdout: new WritableStream({
 *       write(chunk) {
 *         return new Promise((resolve, reject) => {
 *           process.stdout.write(chunk, (err) => {
 *             if (err) reject(err);
 *             else resolve();
 *           });
 *         });
 *       },
 *     }),
 *     stderr: new WritableStream({
 *       write(chunk) {
 *         return new Promise((resolve, reject) => {
 *           process.stderr.write(chunk, (err) => {
 *             if (err) reject(err);
 *             else resolve();
 *           });
 *         });
 *       },
 *     }),
 *     exit: (code: number) => process.exit(code),
 *   };
 *
 *   const proxyConfig = {
 *     command: config.command,
 *     commandArgs: config.args,
 *     entryFile: config.watchFile || null,
 *     restartDelay: config.restartDelay || 1000,
 *     killDelay: 1000,
 *     readyDelay: 2000,
 *   };
 *
 *   return new MCPProxy(dependencies, proxyConfig);
 * }
 *
 * // Usage
 * const proxy = createMCPProxy({
 *   command: 'node',
 *   args: ['dist/server.js'],
 *   watchFile: 'dist/server.js',
 *   restartDelay: 500,
 * });
 *
 * await proxy.start();
 * ```
 *
 * @example Custom ProcessManager
 * ```typescript
 * import { NodeProcessManager, ProcessManager, ManagedProcess } from 'mcpmon';
 *
 * class CustomProcessManager extends NodeProcessManager {
 *   spawn(command: string, args: string[], options?: any): ManagedProcess {
 *     console.log(`Starting: ${command} ${args.join(' ')}`);
 *     return super.spawn(command, args, options);
 *   }
 * }
 *
 * const customProcManager = new CustomProcessManager();
 * // Use with MCPProxy...
 * ```
 */
export { MCPProxy } from "./proxy.js";
export type { MCPProxyConfig } from "./proxy.js";
export { NodeProcessManager } from "./node/NodeProcessManager.js";
export { NodeFileSystem } from "./node/NodeFileSystem.js";
export type { ProcessManager, ManagedProcess, FileSystem, FileEvent, FileEventType, ExitStatus, SpawnOptions, ProxyDependencies, } from "./interfaces.js";
export { setup, setupCommand } from "./setup.js";
/**
 * Helper function to create a standard MCP proxy with Node.js implementations.
 * This provides a simple API for common use cases.
 *
 * @param config - Configuration for the MCP server and proxy behavior
 * @returns Promise<MCPProxy> instance ready to start
 *
 * @example
 * ```typescript
 * import { createMCPProxy } from 'mcpmon';
 *
 * const proxy = await createMCPProxy({
 *   command: 'node',
 *   args: ['dist/server.js'],
 *   watchFile: 'dist/server.js',
 * });
 *
 * await proxy.start();
 * ```
 */
export declare function createMCPProxy(config: {
    command: string;
    args: string[];
    watchFile?: string;
    restartDelay?: number;
    env?: Record<string, string>;
    killDelay?: number;
    readyDelay?: number;
}): Promise<import("./proxy.js").MCPProxy>;
//# sourceMappingURL=index.d.ts.map