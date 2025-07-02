/**
 * Integration tests for Node.js implementations
 *
 * Tests the actual NodeFileSystem and NodeProcessManager implementations
 * to ensure they work correctly with real file I/O and process operations.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { NodeFileSystem } from "../../src/node/NodeFileSystem.js";
import { NodeProcessManager } from "../../src/node/NodeProcessManager.js";
import { join } from "path";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);
// Use process.cwd() as tests run from project root
const testDir = join(process.cwd(), "tests", "integration");

describe("NodeFileSystem Integration Tests", () => {
  let fs: NodeFileSystem;
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    fs = new NodeFileSystem();
    testDir = await mkdtemp(join(tmpdir(), "node-fs-test-"));
    testFile = join(testDir, "test.txt");
    await writeFile(testFile, "initial content");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should read file contents", async () => {
    const content = await fs.readFile(testFile);
    expect(content).toBe("initial content");
  });

  it("should write file contents", async () => {
    await fs.writeFile(testFile, "updated content");
    const content = await readFile(testFile, "utf-8");
    expect(content).toBe("updated content");
  });

  it("should check file existence", async () => {
    expect(await fs.exists(testFile)).toBe(true);
    expect(await fs.exists(join(testDir, "nonexistent.txt"))).toBe(false);
  });

  it("should copy files", async () => {
    const destFile = join(testDir, "copy.txt");
    await fs.copyFile(testFile, destFile);

    const content = await readFile(destFile, "utf-8");
    expect(content).toBe("initial content");
  });

  it("should watch for file changes", async () => {
    const events: any[] = [];
    const watcher = fs.watch([testFile]);

    // Start collecting events
    const collectPromise = (async () => {
      for await (const event of watcher) {
        events.push(event);
        if (events.length >= 2) break; // Collect 2 events then stop
      }
    })();

    // Wait a bit for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger file changes
    await writeFile(testFile, "change 1");
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(testFile, "change 2");

    // Wait for events to be collected
    await Promise.race([collectPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);

    // Should have detected changes
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe("modify");
    expect(events[0].path).toBe(testFile);
  });

  it("should watch multiple files", async () => {
    const file1 = join(testDir, "file1.txt");
    const file2 = join(testDir, "file2.txt");
    await writeFile(file1, "content1");
    await writeFile(file2, "content2");

    const events: any[] = [];
    const watcher = fs.watch([file1, file2]);

    // Start collecting events
    const collectPromise = (async () => {
      for await (const event of watcher) {
        events.push(event);
        if (events.length >= 2) break;
      }
    })();

    // Wait for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Modify both files
    await writeFile(file1, "updated1");
    await writeFile(file2, "updated2");

    // Wait for events
    await Promise.race([collectPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);

    // Should have events for both files
    const file1Events = events.filter((e) => e.path === file1);
    const file2Events = events.filter((e) => e.path === file2);
    expect(file1Events.length).toBeGreaterThanOrEqual(1);
    expect(file2Events.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle file removal", async () => {
    const tempFile = join(testDir, "temp.txt");
    await writeFile(tempFile, "temp content");

    const events: any[] = [];
    const watcher = fs.watch([tempFile]);

    const collectPromise = (async () => {
      for await (const event of watcher) {
        events.push(event);
        if (event.type === "remove") break;
      }
    })();

    // Wait for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Remove the file
    await rm(tempFile);

    // Wait for removal event
    await Promise.race([collectPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);

    const removeEvent = events.find((e) => e.type === "remove");
    expect(removeEvent).toBeTruthy();
    expect(removeEvent?.path).toBe(tempFile);
  });
});

describe("NodeProcessManager Integration Tests", () => {
  let pm: NodeProcessManager;

  beforeEach(() => {
    pm = new NodeProcessManager();
  });

  it("should spawn a process and capture output", async () => {
    const proc = pm.spawn("node", ["-e", "console.log('hello world')"]);

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    const status = await proc.status;
    expect(status.code).toBe(0);
    expect(output.trim()).toBe("hello world");
  });

  it("should capture stderr output", async () => {
    const proc = pm.spawn("node", ["-e", "console.error('error message')"]);

    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    let error = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      error += decoder.decode(value);
    }

    const status = await proc.status;
    expect(status.code).toBe(0);
    expect(error.trim()).toBe("error message");
  });

  it("should handle stdin input", async () => {
    const proc = pm.spawn("node", [
      "-e",
      `
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.on('line', (line) => {
        console.log('ECHO: ' + line);
        if (line === 'exit') process.exit(0);
      });
    `,
    ]);

    const writer = proc.stdin.getWriter();
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    // Send input
    await writer.write(new TextEncoder().encode("test message\n"));
    await writer.write(new TextEncoder().encode("exit\n"));
    writer.releaseLock();

    // Read output
    let output = "";
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }
    })();

    // Wait for process to exit
    const status = await proc.status;
    await readPromise;

    expect(status.code).toBe(0);
    expect(output).toContain("ECHO: test message");
    expect(output).toContain("ECHO: exit");
  });

  it("should handle process termination with signals", async () => {
    const proc = pm.spawn("node", ["-e", "setInterval(() => {}, 1000)"]);

    // Give process time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Kill with SIGTERM
    proc.kill("SIGTERM");

    const status = await proc.status;
    expect(status.signal).toBe("SIGTERM");
  });

  it("should handle non-zero exit codes", async () => {
    const proc = pm.spawn("node", ["-e", "process.exit(42)"]);

    const status = await proc.status;
    expect(status.code).toBe(42);
    expect(status.signal).toBeNull();
  });

  it("should spawn with environment variables", async () => {
    const proc = pm.spawn("node", ["-e", "console.log(process.env.TEST_VAR)"], {
      env: { ...process.env, TEST_VAR: "custom value" },
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output.trim()).toBe("custom value");
  });

  it("should spawn with custom working directory", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "node-proc-test-"));

    try {
      const proc = pm.spawn("node", ["-e", "console.log(process.cwd())"], {
        cwd: testDir,
      });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let output = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }

      // Normalize paths to handle macOS /var -> /private/var symlinks
      const normalizedOutput = output.trim().replace(/^\/private/, "");
      const normalizedTestDir = testDir.replace(/^\/private/, "");
      expect(normalizedOutput).toBe(normalizedTestDir);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should handle spawn errors gracefully", async () => {
    const proc = pm.spawn("nonexistent-command-that-should-not-exist", ["--version"]);

    // The spawn error should reject the status promise
    await expect(proc.status).rejects.toThrow("Command not found");
  });

  it("should handle multiple concurrent processes", async () => {
    const processes = [];
    const outputs: string[] = [];

    // Spawn 5 processes
    for (let i = 0; i < 5; i++) {
      const proc = pm.spawn("node", ["-e", `console.log('Process ${i}')`]);
      processes.push(proc);
    }

    // Collect outputs in parallel
    const outputPromises = processes.map(async (proc) => {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let output = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }

      return output.trim();
    });

    // Wait for all outputs
    outputs.push(...(await Promise.all(outputPromises)));

    // Wait for all to complete
    const statuses = await Promise.all(processes.map((p) => p.status));

    // Verify all completed successfully
    statuses.forEach((status) => {
      expect(status.code).toBe(0);
    });

    // Verify we got all outputs
    for (let i = 0; i < 5; i++) {
      expect(outputs).toContain(`Process ${i}`);
    }
  });

  it("should properly close streams", async () => {
    const proc = pm.spawn("node", [
      "-e",
      `
      process.stdin.on('data', (data) => {
        console.log('Received:', data.toString().trim());
      });
      setTimeout(() => process.exit(0), 1000);
    `,
    ]);

    const writer = proc.stdin.getWriter();

    // Write some data
    await writer.write(new TextEncoder().encode("test\n"));

    // Close the writer
    await writer.close();

    // Process should still complete normally
    const status = await proc.status;
    expect(status.code).toBe(0);
  });
});
