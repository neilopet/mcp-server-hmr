/// <reference path="./global.d.ts" />
/**
 * Unit tests for parseWatchAndCommand() function from CLI
 * Tests pure function behavior without process spawning
 */

import { describe, it, expect } from "@jest/globals";
import { parseWatchAndCommand } from "../../src/cli-utils.js";

describe("parseWatchAndCommand", () => {
  // Test Case 1: Empty args returns empty watchTargets
  it("should return empty structure for empty args", () => {
    const result = parseWatchAndCommand([]);
    expect(result).toEqual({
      watchTargets: [],
      command: "",
      commandArgs: []
    });
  });

  // Test Case 2: '--watch file.js node server' returns correct structure
  it("should parse single --watch flag with command", () => {
    const result = parseWatchAndCommand(["--watch", "file.js", "node", "server"]);
    expect(result).toEqual({
      watchTargets: ["file.js"],
      command: "node",
      commandArgs: ["server"]
    });
  });

  // Test Case 3: Multiple --watch flags handled properly
  it("should handle multiple --watch flags", () => {
    const result = parseWatchAndCommand([
      "--watch", "file.js",
      "--watch", "dir/",
      "node", "server.js"
    ]);
    expect(result).toEqual({
      watchTargets: ["file.js", "dir/"],
      command: "node",
      commandArgs: ["server.js"]
    });
  });

  // Test Case 4: Error thrown when no command after --watch flags
  it("should throw error when no command after --watch flags", () => {
    expect(() => {
      parseWatchAndCommand(["--watch", "file.js", "--watch", "dir/"]);
    }).toThrow("Command is required when using --watch flags");
  });

  it("should throw error when --watch flag has no argument", () => {
    expect(() => {
      parseWatchAndCommand(["--watch"]);
    }).toThrow("--watch flag requires a path argument");
  });

  // Test Case 5: Mixed flags and arguments parsed correctly
  it("should handle mixed flags and arguments", () => {
    const result = parseWatchAndCommand([
      "--verbose",
      "--watch", "config.json",
      "--delay", "2000",
      "python", "app.py", "--debug"
    ]);
    expect(result).toEqual({
      watchTargets: ["config.json"],
      command: "python",
      commandArgs: ["app.py", "--debug"]
    });
  });

  // Additional test cases for edge cases

  it("should handle command without --watch flags", () => {
    const result = parseWatchAndCommand(["node", "server.js", "--port", "3000"]);
    expect(result).toEqual({
      watchTargets: [],
      command: "node",
      commandArgs: ["server.js", "--port", "3000"]
    });
  });

  it("should handle flags that look like paths", () => {
    const result = parseWatchAndCommand([
      "--watch", "--config.json",
      "node", "server.js"
    ]);
    expect(result).toEqual({
      watchTargets: ["--config.json"],
      command: "node",
      commandArgs: ["server.js"]
    });
  });

  it("should handle watch paths with spaces (when properly quoted by shell)", () => {
    const result = parseWatchAndCommand([
      "--watch", "my file.js",
      "node", "server.js"
    ]);
    expect(result).toEqual({
      watchTargets: ["my file.js"],
      command: "node",
      commandArgs: ["server.js"]
    });
  });

  it("should handle complex real-world example", () => {
    const result = parseWatchAndCommand([
      "--watch", "src/",
      "--watch", "config/app.json",
      "--watch", "package.json",
      "node", "--inspect", "server.js", "--port", "8080"
    ]);
    expect(result).toEqual({
      watchTargets: ["src/", "config/app.json", "package.json"],
      command: "node",
      commandArgs: ["--inspect", "server.js", "--port", "8080"]
    });
  });

  it("should preserve other flags before command", () => {
    const result = parseWatchAndCommand([
      "--verbose",
      "--enable-extension", "logger",
      "--watch", "app.js",
      "deno", "run", "server.ts"
    ]);
    expect(result).toEqual({
      watchTargets: ["app.js"],
      command: "deno",
      commandArgs: ["run", "server.ts"]
    });
  });

  it("should handle watch at the end (edge case)", () => {
    const result = parseWatchAndCommand([
      "python", "app.py",
      "--watch", "config.yml"  // This gets treated as command args since command already found
    ]);
    expect(result).toEqual({
      watchTargets: [],
      command: "python",
      commandArgs: ["app.py", "--watch", "config.yml"]
    });
  });
});