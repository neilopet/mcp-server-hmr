/**
 * Deno implementation of FileSystem interface
 *
 * Wraps Deno file system APIs to provide the FileSystem interface,
 * handling platform-specific details like file watching and error handling.
 */
import { FileEvent, FileSystem } from "../interfaces.ts";
/**
 * Deno implementation of FileSystem interface
 *
 * Uses Deno.watchFs for file watching and Deno file APIs for I/O operations.
 */
export declare class DenoFileSystem implements FileSystem {
    /**
     * Watch file system paths for changes using Deno.watchFs
     */
    watch(paths: string[]): AsyncIterable<FileEvent>;
    /**
     * Read file contents as UTF-8 string using Deno.readTextFile
     */
    readFile(path: string): Promise<string>;
    /**
     * Write string contents to file using Deno.writeTextFile
     */
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Check if a file or directory exists using Deno.stat
     */
    exists(path: string): Promise<boolean>;
    /**
     * Copy a file from source to destination using Deno.copyFile
     */
    copyFile(src: string, dest: string): Promise<void>;
}
export declare const denoFileSystem: DenoFileSystem;
//# sourceMappingURL=DenoFileSystem.d.ts.map