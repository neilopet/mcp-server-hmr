/**
 * Core interfaces for MCP Hot-Reload Proxy
 *
 * These interfaces provide platform abstraction for process management,
 * file system operations, and event handling. They enable dependency
 * injection and cross-platform compatibility between Deno and Node.js.
 */
/**
 * Options for spawning a managed process
 */
export interface SpawnOptions {
    /** Environment variables for the process */
    env?: Record<string, string>;
    /** Working directory for the process */
    cwd?: string;
}
/**
 * Exit status information for a completed process
 */
export interface ExitStatus {
    /** Exit code (null if terminated by signal) */
    code: number | null;
    /** Termination signal (null if exited normally) */
    signal: string | null;
}
/**
 * Represents a managed child process with stream access
 *
 * This interface abstracts the differences between Deno's ChildProcess
 * and Node.js's ChildProcess, providing a consistent API for both.
 */
export interface ManagedProcess {
    /** Process ID (undefined if process failed to start) */
    readonly pid?: number;
    /** Writable stream for sending data to process stdin */
    readonly stdin: WritableStream<Uint8Array>;
    /** Readable stream for receiving data from process stdout */
    readonly stdout: ReadableStream<Uint8Array>;
    /** Readable stream for receiving data from process stderr */
    readonly stderr: ReadableStream<Uint8Array>;
    /** Promise that resolves when the process exits */
    readonly status: Promise<ExitStatus>;
    /**
     * Terminate the process with the specified signal
     * @param signal - Signal to send (default: "SIGTERM")
     * @returns true if signal was sent successfully
     */
    kill(signal?: string): boolean;
}
/**
 * Interface for managing child processes
 *
 * Abstracts process creation and management across platforms.
 * Implementations must handle platform-specific details like
 * signal handling and stream management.
 */
export interface ProcessManager {
    /**
     * Spawn a new child process
     *
     * @param command - Command to execute
     * @param args - Command arguments
     * @param options - Spawn options (env, cwd)
     * @returns ManagedProcess instance
     * @throws Error if process cannot be spawned
     */
    spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;
}
/**
 * File system event types
 */
export type FileEventType = "create" | "modify" | "remove";
/**
 * Represents a file system change event
 */
export interface FileEvent {
    /** Type of change that occurred */
    type: FileEventType;
    /** Absolute path to the affected file */
    path: string;
}
/**
 * Interface for file system operations
 *
 * Provides abstraction for file I/O and file watching functionality.
 * Implementations must handle platform-specific file watching
 * mechanisms and provide proper error handling.
 */
export interface FileSystem {
    /**
     * Watch file system paths for changes
     *
     * @param paths - Array of paths to watch (files or directories)
     * @returns AsyncIterable that yields FileEvent objects
     * @throws Error if watching fails (permissions, invalid paths, etc.)
     */
    watch(paths: string[]): AsyncIterable<FileEvent>;
    /**
     * Read file contents as UTF-8 string
     *
     * @param path - Absolute path to file
     * @returns Promise resolving to file contents
     * @throws Error if file cannot be read
     */
    readFile(path: string): Promise<string>;
    /**
     * Write string contents to file
     *
     * @param path - Absolute path to file
     * @param content - UTF-8 string content to write
     * @returns Promise that resolves when write completes
     * @throws Error if file cannot be written
     */
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Check if a file or directory exists
     *
     * @param path - Absolute path to check
     * @returns Promise resolving to true if path exists, false otherwise
     */
    exists(path: string): Promise<boolean>;
    /**
     * Copy a file from source to destination
     *
     * @param src - Source file path
     * @param dest - Destination file path
     * @returns Promise that resolves when copy completes
     * @throws Error if copy fails
     */
    copyFile(src: string, dest: string): Promise<void>;
}
/**
 * Configuration object for MCPProxy dependency injection
 */
export interface ProxyDependencies {
    /** Process manager for spawning and controlling MCP servers */
    procManager: ProcessManager;
    /** File system interface for config and file watching */
    fs: FileSystem;
    /** Standard input stream for receiving client messages */
    stdin: ReadableStream<Uint8Array>;
    /** Standard output stream for sending responses to client */
    stdout: WritableStream<Uint8Array>;
    /** Standard error stream for logging and diagnostics */
    stderr: WritableStream<Uint8Array>;
    /** Process exit function for graceful termination */
    exit: (code: number) => void;
}
/**
 * Configuration object for config launcher dependency injection
 */
export interface ConfigLauncherDependencies {
    /** File system interface for config file operations */
    fs: FileSystem;
    /** Process exit function for graceful termination */
    exit: (code: number) => void;
}
/**
 * Type guard to check if an object implements ProcessManager
 */
export declare function isProcessManager(obj: unknown): obj is ProcessManager;
/**
 * Type guard to check if an object implements FileSystem
 */
export declare function isFileSystem(obj: unknown): obj is FileSystem;
//# sourceMappingURL=interfaces.d.ts.map