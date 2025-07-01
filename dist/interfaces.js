/**
 * Core interfaces for MCP Hot-Reload Proxy
 *
 * These interfaces provide platform abstraction for process management,
 * file system operations, and event handling. They enable dependency
 * injection and cross-platform compatibility between Deno and Node.js.
 */
/**
 * Type guard to check if an object implements ProcessManager
 */
export function isProcessManager(obj) {
    return obj !== null &&
        typeof obj === "object" &&
        "spawn" in obj &&
        typeof obj.spawn === "function";
}
/**
 * Type guard to check if an object implements FileSystem
 */
export function isFileSystem(obj) {
    return obj !== null &&
        typeof obj === "object" &&
        "watch" in obj &&
        "readFile" in obj &&
        "writeFile" in obj &&
        typeof obj.watch === "function" &&
        typeof obj.readFile === "function" &&
        typeof obj.writeFile === "function";
}
