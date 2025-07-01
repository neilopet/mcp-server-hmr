/**
 * TypeScript declarations for global variables used in behavioral tests
 * These variables are normally set by main.ts during module initialization
 */

declare global {
  var command: string | undefined;
  var commandArgs: string[] | undefined;
  var entryFile: string | null | undefined;
  var restartDelay: number | undefined;
}

export {};