/**
 * Mock implementation of FileSystem for testing
 * 
 * Provides full control over file system operations, allowing tests to:
 * - Use in-memory file storage (no actual file I/O)
 * - Manually trigger file watch events
 * - Track all file operations for verification
 * - Configure delays to test timing behavior
 * - Simulate file system errors
 */

import { FileSystem, FileEvent, FileEventType } from "../../src/interfaces.ts";

/**
 * Represents an active file watcher
 */
interface FileWatcher {
  id: string;
  paths: string[];
  controller: ReadableStreamDefaultController<FileEvent>;
  active: boolean;
}

/**
 * Mock implementation of FileSystem for testing
 */
export class MockFileSystem implements FileSystem {
  // In-memory file storage
  private files = new Map<string, string>();
  private fileExists = new Set<string>();
  
  // Active watchers
  private watchers = new Map<string, FileWatcher>();
  private nextWatcherId = 1;
  
  // Operation tracking
  public readonly readCalls: Array<{ path: string; timestamp: number; result?: string }> = [];
  public readonly writeCalls: Array<{ path: string; content: string; timestamp: number }> = [];
  public readonly existsCalls: Array<{ path: string; timestamp: number; result: boolean }> = [];
  public readonly copyCalls: Array<{ src: string; dest: string; timestamp: number }> = [];
  public readonly watchCalls: Array<{ paths: string[]; timestamp: number; watcherId: string }> = [];
  
  // Configuration
  private readDelay = 0;
  private writeDelay = 0;
  private existsDelay = 0;
  private copyDelay = 0;
  private shouldFailRead = false;
  private shouldFailWrite = false;
  private shouldFailExists = false;
  private shouldFailCopy = false;
  private failureMessage = "Mock filesystem error";

  async *watch(paths: string[]): AsyncIterable<FileEvent> {
    const watcherId = `watcher-${this.nextWatcherId++}`;
    
    // Track watch call
    this.watchCalls.push({
      paths: [...paths], // Copy array
      timestamp: Date.now(),
      watcherId,
    });

    // Create readable stream for file events
    const stream = new ReadableStream<FileEvent>({
      start: (controller) => {
        const watcher: FileWatcher = {
          id: watcherId,
          paths: [...paths],
          controller,
          active: true,
        };
        this.watchers.set(watcherId, watcher);
      },
      cancel: () => {
        // Cleanup when watcher is cancelled
        const watcher = this.watchers.get(watcherId);
        if (watcher) {
          watcher.active = false;
          this.watchers.delete(watcherId);
        }
      }
    });

    // Convert stream to async iterable
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async readFile(path: string): Promise<string> {
    if (this.readDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.readDelay));
    }

    const call = { path, timestamp: Date.now() };

    if (this.shouldFailRead) {
      this.readCalls.push(call);
      throw new Error(`${this.failureMessage}: Failed to read file '${path}'`);
    }

    if (!this.files.has(path) && !this.fileExists.has(path)) {
      this.readCalls.push(call);
      throw new Error(`File not found: ${path}`);
    }

    const content = this.files.get(path) || "";
    this.readCalls.push({ ...call, result: content });
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.writeDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.writeDelay));
    }

    const call = { path, content, timestamp: Date.now() };
    this.writeCalls.push(call);

    if (this.shouldFailWrite) {
      throw new Error(`${this.failureMessage}: Failed to write file '${path}'`);
    }

    this.files.set(path, content);
    this.fileExists.add(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.existsDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.existsDelay));
    }

    const call = { path, timestamp: Date.now() };

    if (this.shouldFailExists) {
      this.existsCalls.push({ ...call, result: false });
      throw new Error(`${this.failureMessage}: Failed to check if path exists '${path}'`);
    }

    const exists = this.files.has(path) || this.fileExists.has(path);
    this.existsCalls.push({ ...call, result: exists });
    return exists;
  }

  async copyFile(src: string, dest: string): Promise<void> {
    if (this.copyDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.copyDelay));
    }

    const call = { src, dest, timestamp: Date.now() };
    this.copyCalls.push(call);

    if (this.shouldFailCopy) {
      throw new Error(`${this.failureMessage}: Failed to copy file from '${src}' to '${dest}'`);
    }

    if (!this.files.has(src) && !this.fileExists.has(src)) {
      throw new Error(`Source file not found: ${src}`);
    }

    const content = this.files.get(src) || "";
    this.files.set(dest, content);
    this.fileExists.add(dest);
  }

  // Test control methods

  /**
   * Set a file's content in the mock filesystem
   */
  setFileContent(path: string, content: string): void {
    this.files.set(path, content);
    this.fileExists.add(path);
  }

  /**
   * Mark a file as existing without setting content
   */
  setFileExists(path: string, exists = true): void {
    if (exists) {
      this.fileExists.add(path);
      if (!this.files.has(path)) {
        this.files.set(path, ""); // Empty content
      }
    } else {
      this.fileExists.delete(path);
      this.files.delete(path);
    }
  }

  /**
   * Get file content from mock filesystem
   */
  getFileContent(path: string): string | undefined {
    return this.files.get(path);
  }

  /**
   * Manually trigger a file change event for all active watchers
   */
  triggerFileEvent(path: string, type: FileEventType): void {
    const event: FileEvent = { path, type };
    
    for (const watcher of this.watchers.values()) {
      if (watcher.active && this.isPathWatched(path, watcher.paths)) {
        watcher.controller.enqueue(event);
      }
    }
  }

  /**
   * Close all active watchers
   */
  closeAllWatchers(): void {
    for (const watcher of this.watchers.values()) {
      if (watcher.active) {
        watcher.controller.close();
        watcher.active = false;
      }
    }
    this.watchers.clear();
  }

  /**
   * Get count of active watchers
   */
  getActiveWatcherCount(): number {
    return Array.from(this.watchers.values()).filter(w => w.active).length;
  }

  /**
   * Set operation delays (simulates slow I/O)
   */
  setDelays(options: {
    read?: number;
    write?: number;
    exists?: number;
    copy?: number;
  }): void {
    if (options.read !== undefined) this.readDelay = options.read;
    if (options.write !== undefined) this.writeDelay = options.write;
    if (options.exists !== undefined) this.existsDelay = options.exists;
    if (options.copy !== undefined) this.copyDelay = options.copy;
  }

  /**
   * Configure operations to fail
   */
  setFailures(options: {
    read?: boolean;
    write?: boolean;
    exists?: boolean;
    copy?: boolean;
    message?: string;
  }): void {
    if (options.read !== undefined) this.shouldFailRead = options.read;
    if (options.write !== undefined) this.shouldFailWrite = options.write;
    if (options.exists !== undefined) this.shouldFailExists = options.exists;
    if (options.copy !== undefined) this.shouldFailCopy = options.copy;
    if (options.message !== undefined) this.failureMessage = options.message;
  }

  /**
   * Clear all tracking data and reset state
   */
  reset(): void {
    this.files.clear();
    this.fileExists.clear();
    this.closeAllWatchers();
    this.readCalls.length = 0;
    this.writeCalls.length = 0;
    this.existsCalls.length = 0;
    this.copyCalls.length = 0;
    this.watchCalls.length = 0;
    this.nextWatcherId = 1;
    this.setDelays({});
    this.setFailures({});
  }

  /**
   * Get operation counts for verification
   */
  getOperationCounts(): {
    reads: number;
    writes: number;
    exists: number;
    copies: number;
    watches: number;
  } {
    return {
      reads: this.readCalls.length,
      writes: this.writeCalls.length,
      exists: this.existsCalls.length,
      copies: this.copyCalls.length,
      watches: this.watchCalls.length,
    };
  }

  /**
   * Check if a path is being watched by the given paths
   */
  private isPathWatched(filePath: string, watchedPaths: string[]): boolean {
    return watchedPaths.some(watchedPath => {
      // Simple path matching - exact match or starts with directory path
      return filePath === watchedPath || 
             filePath.startsWith(watchedPath + '/') ||
             watchedPath.endsWith('/') && filePath.startsWith(watchedPath);
    });
  }
}