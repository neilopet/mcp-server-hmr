/**
 * Node.js implementation of FileSystem interface
 *
 * Wraps Node.js file system APIs and chokidar to provide the FileSystem interface,
 * handling platform-specific details like file watching, path normalization,
 * and error handling.
 */
import { FileEvent, FileSystem } from "../interfaces.js";
/**
 * Node.js implementation of FileSystem interface
 *
 * Uses chokidar for cross-platform file watching and Node.js fs/promises
 * for file I/O operations.
 */
export declare class NodeFileSystem implements FileSystem {
    /**
     * Watch file system paths for changes using chokidar
     */
    watch(paths: string[]): AsyncIterable<FileEvent>;
    /**
     * Read file contents as UTF-8 string using fs/promises
     */
    readFile(path: string): Promise<string>;
    /**
     * Write string contents to file using fs/promises
     */
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Check if a file or directory exists using fs.access
     */
    exists(path: string): Promise<boolean>;
    /**
     * Copy a file from source to destination using fs/promises
     */
    copyFile(src: string, dest: string): Promise<void>;
}
export declare const nodeFileSystem: NodeFileSystem;
//# sourceMappingURL=NodeFileSystem.d.ts.map