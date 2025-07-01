/**
 * Deno implementation of FileSystem interface
 * 
 * Wraps Deno file system APIs to provide the FileSystem interface,
 * handling platform-specific details like file watching and error handling.
 */

import { FileSystem, FileEvent, FileEventType } from "../interfaces.ts";

/**
 * Maps Deno FsEvent kinds to our FileEventType
 */
function mapEventKind(kind: Deno.FsEvent["kind"]): FileEventType {
  switch (kind) {
    case "create":
      return "create";
    case "modify":
      return "modify";
    case "remove":
      return "remove";
    default:
      // For any other Deno event types, default to modify
      return "modify";
  }
}

/**
 * Deno implementation of FileSystem interface
 * 
 * Uses Deno.watchFs for file watching and Deno file APIs for I/O operations.
 */
export class DenoFileSystem implements FileSystem {
  /**
   * Watch file system paths for changes using Deno.watchFs
   */
  async* watch(paths: string[]): AsyncIterable<FileEvent> {
    try {
      // Deno.watchFs can accept multiple paths directly
      const watcher = Deno.watchFs(paths, { recursive: true });
      
      for await (const event of watcher) {
        // Convert each path in the event to a FileEvent
        for (const path of event.paths) {
          const fileEvent: FileEvent = {
            type: mapEventKind(event.kind),
            path: path,
          };
          
          yield fileEvent;
        }
      }
    } catch (error) {
      // If watching fails, throw a descriptive error
      throw new Error(`Failed to watch paths [${paths.join(", ")}]: ${error.message}`);
    }
  }

  /**
   * Read file contents as UTF-8 string using Deno.readTextFile
   */
  async readFile(path: string): Promise<string> {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      // Provide more context in the error message
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`File not found: ${path}`);
      } else if (error instanceof Deno.errors.PermissionDenied) {
        throw new Error(`Permission denied reading file: ${path}`);
      } else {
        throw new Error(`Failed to read file '${path}': ${error.message}`);
      }
    }
  }

  /**
   * Write string contents to file using Deno.writeTextFile
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      await Deno.writeTextFile(path, content);
    } catch (error) {
      // Provide more context in the error message
      if (error instanceof Deno.errors.PermissionDenied) {
        throw new Error(`Permission denied writing file: ${path}`);
      } else if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Directory not found for file: ${path}`);
      } else {
        throw new Error(`Failed to write file '${path}': ${error.message}`);
      }
    }
  }
  
  /**
   * Check if a file or directory exists using Deno.stat
   */
  async exists(path: string): Promise<boolean> {
    try {
      await Deno.stat(path);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      // Re-throw other errors (permissions, etc.)
      throw new Error(`Failed to check if path exists '${path}': ${error.message}`);
    }
  }
  
  /**
   * Copy a file from source to destination using Deno.copyFile
   */
  async copyFile(src: string, dest: string): Promise<void> {
    try {
      await Deno.copyFile(src, dest);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Source file not found: ${src}`);
      } else if (error instanceof Deno.errors.PermissionDenied) {
        throw new Error(`Permission denied copying from '${src}' to '${dest}'`);
      } else {
        throw new Error(`Failed to copy file from '${src}' to '${dest}': ${error.message}`);
      }
    }
  }
}

// Export a default instance for convenience
export const denoFileSystem = new DenoFileSystem();