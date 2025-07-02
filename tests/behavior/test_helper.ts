/// <reference path="./global.d.ts" />
/**
 * Test helper utilities for behavioral tests
 *
 * Provides common setup/teardown patterns to eliminate DRY violations
 * and improve test reliability by removing globalThis usage and setTimeout patterns.
 */

import { MCPProxy, MCPProxyConfig } from "../../src/proxy.js";
import { MockProcessManager } from "../mocks/MockProcessManager.js";
import { MockFileSystem } from "../mocks/MockFileSystem.js";

export interface TestContext {
  proxy: MCPProxy;
  procManager: MockProcessManager;
  fs: MockFileSystem;
  stdinWriter: WritableStreamDefaultWriter<Uint8Array>;
  stdoutReader: ReadableStreamDefaultReader<Uint8Array>;
  stderrReader: ReadableStreamDefaultReader<Uint8Array>;
  teardown: () => Promise<void>;
}

export interface TestProxyConfig {
  command?: string;
  commandArgs?: string[];
  entryFile?: string;
  watchTargets?: string[];
  restartDelay?: number;
  killDelay?: number;
  readyDelay?: number;
  env?: Record<string, string>;
}

const DEFAULT_CONFIG: Required<TestProxyConfig> = {
  command: "node",
  commandArgs: ["/test/server.js"],
  entryFile: "/test/server.js",
  watchTargets: ["/test/server.js"],
  restartDelay: 50, // Fast test timing
  killDelay: 50, // Fast test timing
  readyDelay: 50, // Fast test timing
  env: {},
};

/**
 * Sets up a complete test environment with MCPProxy and mocks
 * Eliminates globalThis usage and provides clean teardown
 */
export function setupProxyTest(config: TestProxyConfig = {}): TestContext {
  const testConfig = { ...DEFAULT_CONFIG, ...config };

  // Create mocks
  const procManager = new MockProcessManager();
  const fs = new MockFileSystem();

  // Set up file system state
  if (testConfig.entryFile) {
    fs.setFileExists(testConfig.entryFile, true);
  }
  if (testConfig.watchTargets) {
    testConfig.watchTargets.forEach((target) => fs.setFileExists(target, true));
  }

  // Create I/O streams
  const { readable: stdinReadable, writable: stdinWritable } = new TransformStream<Uint8Array>();
  const { readable: stdoutReadable, writable: stdoutWritable } = new TransformStream<Uint8Array>();
  const { readable: stderrReadable, writable: stderrWritable } = new TransformStream<Uint8Array>();

  // Create proxy with dependency injection
  const proxy = new MCPProxy(
    {
      procManager,
      fs,
      stdin: stdinReadable,
      stdout: stdoutWritable,
      stderr: stderrWritable,
      exit: (code: number) => {
        /* Mock exit - don't actually exit during tests */
      },
    },
    {
      command: testConfig.command,
      commandArgs: testConfig.commandArgs,
      entryFile: testConfig.entryFile,
      watchTargets: testConfig.watchTargets,
      restartDelay: testConfig.restartDelay,
      killDelay: testConfig.killDelay,
      readyDelay: testConfig.readyDelay,
      env: testConfig.env,
    }
  );

  // Get stream interfaces for test control
  const stdinWriter = stdinWritable.getWriter();
  const stdoutReader = stdoutReadable.getReader();
  const stderrReader = stderrReadable.getReader();

  return {
    proxy,
    procManager,
    fs,
    stdinWriter,
    stdoutReader,
    stderrReader,
    teardown: async () => {
      // Clean shutdown sequence
      try {
        // First ensure all mock processes exit cleanly
        const allProcesses = procManager.getAllSpawnedProcesses();
        for (const proc of allProcesses) {
          if (!proc.hasExited()) {
            proc.simulateExit(0);
          }
        }

        await proxy.shutdown();
      } catch {
        // Ignore shutdown errors in tests
      }
      fs.closeAllWatchers();

      // Release stream resources
      try {
        stdinWriter.releaseLock();
        stdoutReader.releaseLock();
        stderrReader.releaseLock();
      } catch {
        // Ignore lock release errors
      }
    },
  };
}

/**
 * Waits for a specific number of process spawns
 * Eliminates setTimeout patterns in favor of deterministic waiting
 */
export async function waitForSpawns(
  procManager: MockProcessManager,
  expectedCount: number,
  timeoutMs: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (procManager.getSpawnCallCount() >= expectedCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(
    `Timeout waiting for ${expectedCount} spawns. Got ${procManager.getSpawnCallCount()}`
  );
}

/**
 * Waits for proxy to reach a stable state after operations
 * Provides deterministic timing control
 */
export async function waitForStable(ms: number = 100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to simulate a complete restart sequence with proper timing
 */
export async function simulateRestart(
  procManager: MockProcessManager,
  fs: MockFileSystem,
  triggerFile?: string,
  restartDelay: number = 100
): Promise<void> {
  const fileToTrigger = triggerFile || "/test/server.js";

  const initialSpawnCount = procManager.getSpawnCallCount();
  const initialProcess = procManager.getLastSpawnedProcess();

  // Trigger file change
  fs.triggerFileEvent(fileToTrigger, "modify");

  // Wait for restart to begin (must wait longer than restartDelay)
  await waitForStable(restartDelay + 50);

  // Simulate process exit to allow killServer() to complete
  if (initialProcess) {
    initialProcess.simulateExit(0);
  }

  // Wait for new process to spawn
  await waitForSpawns(procManager, initialSpawnCount + 1);
}
