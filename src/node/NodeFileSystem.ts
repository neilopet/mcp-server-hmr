/**
 * Node.js implementation of FileSystem interface
 *
 * Wraps Node.js file system APIs and chokidar to provide the FileSystem interface,
 * handling platform-specific details like file watching, path normalization,
 * and error handling.
 */

import { watch, FSWatcher } from 'chokidar';
import { readFile, writeFile, access, copyFile } from 'fs/promises';
import { constants } from 'fs';
import { normalize, resolve } from 'path';
import { FileEvent, FileEventType, FileSystem } from '../interfaces.js';

/**
 * Maps chokidar event names to our FileEventType
 */
function mapChokidarEvent(event: string): FileEventType {
  switch (event) {
    case 'add':
      return 'create';
    case 'addDir':
      return 'create';
    case 'change':
      return 'modify';
    case 'unlink':
      return 'remove';
    case 'unlinkDir':
      return 'remove';
    default:
      // For any other chokidar event types, default to modify
      return 'modify';
  }
}

/**
 * Node.js implementation of FileSystem interface
 *
 * Uses chokidar for cross-platform file watching and Node.js fs/promises
 * for file I/O operations.
 */
export class NodeFileSystem implements FileSystem {
  /**
   * Watch file system paths for changes using chokidar
   */
  async *watch(paths: string[]): AsyncIterable<FileEvent> {
    let watcher: FSWatcher | null = null;

    try {
      // Normalize paths for cross-platform compatibility
      const normalizedPaths = paths.map(path => normalize(resolve(path)));

      // Create chokidar watcher with appropriate options
      watcher = watch(normalizedPaths, {
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        // Ignore common directories that shouldn't trigger rebuilds
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.DS_Store',
          '**/Thumbs.db'
        ]
      });

      // Create an async iterator from chokidar events
      const eventQueue: FileEvent[] = [];
      let resolveNext: ((value: IteratorResult<FileEvent>) => void) | null = null;
      let rejectNext: ((error: Error) => void) | null = null;
      let isEnded = false;

      // Set up event handlers
      const handleEvent = (event: string, path: string) => {
        const fileEvent: FileEvent = {
          type: mapChokidarEvent(event),
          path: normalize(resolve(path))
        };

        if (resolveNext) {
          resolveNext({ value: fileEvent, done: false });
          resolveNext = null;
          rejectNext = null;
        } else {
          eventQueue.push(fileEvent);
        }
      };

      const handleError = (error: Error) => {
        if (rejectNext) {
          rejectNext(error);
          resolveNext = null;
          rejectNext = null;
        } else {
          // If no pending promise, we need to throw on next iteration
          eventQueue.push(null as any); // Signal error
        }
      };

      // Register event listeners
      watcher.on('add', (path) => handleEvent('add', path));
      watcher.on('addDir', (path) => handleEvent('addDir', path));
      watcher.on('change', (path) => handleEvent('change', path));
      watcher.on('unlink', (path) => handleEvent('unlink', path));
      watcher.on('unlinkDir', (path) => handleEvent('unlinkDir', path));
      watcher.on('error', handleError);

      // Yield events from the async iterator
      while (!isEnded) {
        if (eventQueue.length > 0) {
          const event = eventQueue.shift();
          if (event === null) {
            // Error marker
            throw new Error('File watcher error occurred');
          }
          yield event!;
        } else {
          // Wait for next event
          await new Promise<void>((resolve, reject) => {
            resolveNext = (result) => {
              if (result.done) {
                isEnded = true;
              } else {
                eventQueue.push(result.value);
              }
              resolve();
            };
            rejectNext = reject;
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to watch paths [${paths.join(', ')}]: ${(error as Error).message}`);
    } finally {
      // Clean up watcher
      if (watcher) {
        await watcher.close();
      }
    }
  }

  /**
   * Read file contents as UTF-8 string using fs/promises
   */
  async readFile(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf-8');
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      // Provide more context in the error message
      if (nodeError.code === 'ENOENT') {
        throw new Error(`File not found: ${path}`);
      } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        throw new Error(`Permission denied reading file: ${path}`);
      } else {
        throw new Error(`Failed to read file '${path}': ${nodeError.message}`);
      }
    }
  }

  /**
   * Write string contents to file using fs/promises
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      await writeFile(path, content, 'utf-8');
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      // Provide more context in the error message
      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        throw new Error(`Permission denied writing file: ${path}`);
      } else if (nodeError.code === 'ENOENT') {
        throw new Error(`Directory not found for file: ${path}`);
      } else {
        throw new Error(`Failed to write file '${path}': ${nodeError.message}`);
      }
    }
  }

  /**
   * Check if a file or directory exists using fs.access
   */
  async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      if (nodeError.code === 'ENOENT') {
        return false;
      }
      
      // Re-throw other errors (permissions, etc.)
      throw new Error(`Failed to check if path exists '${path}': ${nodeError.message}`);
    }
  }

  /**
   * Copy a file from source to destination using fs/promises
   */
  async copyFile(src: string, dest: string): Promise<void> {
    try {
      await copyFile(src, dest);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        throw new Error(`Source file not found: ${src}`);
      } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        throw new Error(`Permission denied copying from '${src}' to '${dest}'`);
      } else {
        throw new Error(`Failed to copy file from '${src}' to '${dest}': ${nodeError.message}`);
      }
    }
  }
}

// Export a default instance for convenience
export const nodeFileSystem = new NodeFileSystem();