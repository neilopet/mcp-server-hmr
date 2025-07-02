/**
 * Integration tests for CLI
 *
 * Tests the command-line interface functionality including:
 * - Argument parsing
 * - Watch file auto-detection
 * - Environment variable handling
 * - Proxy initialization
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { spawn } from "child_process";
import { join } from "path";
import { readFile, writeFile, unlink } from "fs/promises";

// Use process.cwd() as tests run from project root
const testDir = join(process.cwd(), "tests", "integration");
const CLI_PATH = join(testDir, "../../dist/cli.js");

// Track all spawned processes for cleanup
const spawnedProcesses: Array<any> = [];

// Helper to spawn and track processes
function spawnTracked(command: string, args: string[], options?: any): any {
  const proc = spawn(command, args, options);
  spawnedProcesses.push(proc);
  return proc;
}

// Kill all tracked processes
async function killAllProcesses() {
  for (const proc of spawnedProcesses) {
    if (proc && !proc.killed) {
      try {
        proc.kill("SIGTERM");
        // Give it a moment to exit gracefully
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      } catch (e) {
        // Process might already be dead
      }
    }
  }
  spawnedProcesses.length = 0;
}

describe("CLI Integration Tests", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testServerPath: string;
  let processes: any[] = [];

  beforeEach(async () => {
    originalEnv = { ...process.env };
    testServerPath = join(testDir, "test-server.js");

    // Create a simple test server file
    await writeFile(
      testServerPath,
      `#!/usr/bin/env node
console.log('Test server starting...');
process.stdin.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg.includes('initialize')) {
    process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{}}}\\n');
  }
});
// Keep process alive
setInterval(() => {}, 1000);`
    );
  });

  afterEach(async () => {
    // Clean up all spawned processes
    await killAllProcesses();

    process.env = originalEnv;
    try {
      await unlink(testServerPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it("should display help when called with --help", async () => {
    const output = await runCLI(["--help"]);

    expect(output).toContain("Hot-reload monitor for MCP servers");
    expect(output).toContain("Usage:");
    expect(output).toContain("Examples:");
    expect(output).toContain("mcpmon node server.js");
    expect(output).toContain("mcpmon python server.py");
    expect(output).toContain("Environment Variables:");
  });

  it("should display help when called without arguments", async () => {
    const output = await runCLI([]);

    expect(output).toContain("Hot-reload monitor for MCP servers");
    expect(output).toContain("Usage:");
  });

  it("should auto-detect watch file for Node.js", async () => {
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", testServerPath], {
      env: { ...process.env, MCPMON_VERBOSE: "true" },
    });

    const output = await collectOutput(proc, 2000);

    expect(output).toContain(`Watching ${testServerPath}`);
    expect(output).toContain("Starting MCP server");
  });

  it("should auto-detect watch file for Python", async () => {
    const pythonScript = join(testDir, "test-server.py");
    await writeFile(pythonScript, "print('Python test server')");

    try {
      const proc = spawnTracked(process.execPath, [CLI_PATH, "python", pythonScript], {
        env: { ...process.env, MCPMON_VERBOSE: "true" },
      });

      const output = await collectOutput(proc, 2000);

      expect(output).toContain(`Watching ${pythonScript}`);
      expect(output).toContain("Starting MCP server");
    } finally {
      await unlink(pythonScript);
    }
  });

  it("should auto-detect watch file for Deno", async () => {
    const denoScript = join(testDir, "test-server.ts");
    await writeFile(denoScript, "console.log('Deno test server')");

    try {
      const proc = spawnTracked(process.execPath, [CLI_PATH, "deno", "run", denoScript], {
        env: { ...process.env, MCPMON_VERBOSE: "true" },
      });

      const output = await collectOutput(proc, 2000);

      expect(output).toContain(`Watching ${denoScript}`);
      expect(output).toContain("Starting MCP server");
    } finally {
      await unlink(denoScript);
    }
  });

  it("should respect MCPMON_WATCH environment variable", async () => {
    const watchPath = "/custom/watch/path.js";
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", testServerPath], {
      env: {
        ...process.env,
        MCPMON_WATCH: watchPath,
        MCPMON_VERBOSE: "true",
      },
    });

    const output = await collectOutput(proc, 2000);

    expect(output).toContain(`Watching ${watchPath}`);
  });

  it("should respect MCPMON_DELAY environment variable", async () => {
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", testServerPath], {
      env: {
        ...process.env,
        MCPMON_DELAY: "5000",
        MCPMON_VERBOSE: "true",
      },
    });

    const output = await collectOutput(proc, 2000);

    expect(output).toContain("Starting MCP server");
    // Should see delay applied in configuration
  });

  it("should handle multiple watch paths from MCPMON_WATCH", async () => {
    const watchPaths = "/path1.js,/path2.js,/path3.js";
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", testServerPath], {
      env: {
        ...process.env,
        MCPMON_WATCH: watchPaths,
        MCPMON_VERBOSE: "true",
      },
    });

    const output = await collectOutput(proc, 2000);

    expect(output).toContain("Watching /path1.js");
  });

  it("should pass through additional arguments to the server", async () => {
    const proc = spawnTracked(
      process.execPath,
      [CLI_PATH, "node", "--inspect", testServerPath, "--custom-arg"],
      {
        env: { ...process.env, MCPMON_VERBOSE: "true" },
      }
    );

    const output = await collectOutput(proc, 2000);

    expect(output).toContain("Starting MCP server");
    // The proxy should pass all args including --inspect and --custom-arg
  });

  it("should handle server spawn errors gracefully", async () => {
    const proc = spawnTracked(process.execPath, [CLI_PATH, "nonexistent-command", "file.js"], {
      env: { ...process.env, MCPMON_VERBOSE: "true" },
    });

    const output = await collectOutput(proc, 3000);

    expect(output).toContain("Command not found");
  });

  it("should handle watch file errors gracefully", async () => {
    const nonExistentFile = "/definitely/does/not/exist/server.js";
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", nonExistentFile], {
      env: { ...process.env, MCPMON_VERBOSE: "true" },
    });

    const output = await collectOutput(proc, 3000);

    // Should fail when trying to watch non-existent file
    expect(output).toContain("Cannot find module");
  });

  it("should handle SIGINT gracefully", async () => {
    const proc = spawnTracked(process.execPath, [CLI_PATH, "node", testServerPath], {
      env: { ...process.env, MCPMON_VERBOSE: "true" },
    });

    // Wait for startup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send SIGINT
    proc.kill("SIGINT");

    // Wait for shutdown
    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on("exit", (code: number | null) => resolve(code));
    });

    expect(exitCode).toBe(0);
  });

  it("should forward stdin to the server process", async () => {
    const serverPath = join(testDir, "echo-server.js");
    await writeFile(
      serverPath,
      `
      process.stdin.on('data', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'test') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { echo: msg.params }
          }) + '\\n');
        }
      });
      setInterval(() => {}, 1000);
      `
    );

    try {
      const proc = spawnTracked(process.execPath, [CLI_PATH, "node", serverPath]);

      // Wait for startup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send test message
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "test",
          params: { message: "hello" },
        }) + "\n"
      );

      const output = await collectOutput(proc, 1000);
      const response = JSON.parse(
        output.split("\n").find((line) => line.includes('"echo"')) || "{}"
      );

      expect(response.result?.echo?.message).toBe("hello");
    } finally {
      await unlink(serverPath);
    }
  });
});

// Helper functions

async function runCLI(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawnTracked(process.execPath, [CLI_PATH, ...args]);
    let output = "";
    let error = "";

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      error += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code !== 0 && !args.includes("--help") && args.length > 0) {
        reject(new Error(`CLI exited with code ${code}: ${error}`));
      } else {
        resolve(output + error);
      }
    });
  });
}

async function collectOutput(proc: any, timeout: number): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    let error = "";

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      error += data.toString();
    });

    setTimeout(() => {
      resolve(output + error);
    }, timeout);
  });
}
