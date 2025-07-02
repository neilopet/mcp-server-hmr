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
 * Change event types - extensible for different monitoring scenarios
 *
 * Core file operations:
 * - create: New file/resource created
 * - modify: Existing file/resource modified
 * - remove: File/resource deleted
 *
 * Package monitoring:
 * - version_update: Package version changed
 * - dependency_change: Package dependencies modified
 */
export type ChangeEventType =
  | "create"
  | "modify"
  | "remove"
  | "version_update"
  | "dependency_change";

/**
 * @deprecated Use ChangeEventType instead. Maintained for backward compatibility.
 */
export type FileEventType = "create" | "modify" | "remove";

/**
 * Represents a change event - files, packages, or other monitored resources
 */
export interface ChangeEvent {
  /** Type of change that occurred */
  type: ChangeEventType;
  /** Absolute path to the affected resource (file path, package name, etc.) */
  path: string;
  /** Optional metadata about the change */
  metadata?: Record<string, any>;
}

/**
 * @deprecated Use ChangeEvent instead. Maintained for backward compatibility.
 */
export interface FileEvent {
  /** Type of change that occurred */
  type: FileEventType;
  /** Absolute path to the affected file */
  path: string;
}

/**
 * Generic interface for monitoring changes in files, packages, or other resources
 *
 * Provides abstraction for change detection and resource I/O operations.
 * Implementations can monitor files, package registries, APIs, or other sources.
 */
export interface ChangeSource {
  /**
   * Watch resources for changes
   *
   * @param paths - Array of paths/identifiers to watch (files, packages, URLs, etc.)
   * @returns AsyncIterable that yields ChangeEvent objects
   * @throws Error if watching fails (permissions, invalid paths, etc.)
   */
  watch(paths: string[]): AsyncIterable<ChangeEvent>;

  /**
   * Read resource contents as UTF-8 string
   *
   * @param path - Absolute path to resource
   * @returns Promise resolving to resource contents
   * @throws Error if resource cannot be read
   */
  readFile(path: string): Promise<string>;

  /**
   * Write string contents to resource
   *
   * @param path - Absolute path to resource
   * @param content - UTF-8 string content to write
   * @returns Promise that resolves when write completes
   * @throws Error if resource cannot be written
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check if a resource exists
   *
   * @param path - Absolute path to check
   * @returns Promise resolving to true if resource exists, false otherwise
   */
  exists(path: string): Promise<boolean>;

  /**
   * Copy a resource from source to destination
   *
   * @param src - Source resource path
   * @param dest - Destination resource path
   * @returns Promise that resolves when copy completes
   * @throws Error if copy fails
   */
  copyFile(src: string, dest: string): Promise<void>;
}

/**
 * @deprecated Use ChangeSource instead. Maintained for backward compatibility.
 *
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
  /** Change source interface for monitoring resources (preferred) */
  changeSource?: ChangeSource;
  /** @deprecated Use changeSource instead. File system interface for config and file watching */
  fs?: FileSystem;
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
