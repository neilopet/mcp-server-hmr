/**
 * Mock implementation of ProcessManager for testing
 *
 * Provides full control over process lifecycle events, allowing tests to:
 * - Track spawn/kill calls and arguments
 * - Simulate process stdout/stderr data
 * - Control process exit timing and codes
 * - Trigger events manually for predictable testing
 */

import { ExitStatus, ManagedProcess, ProcessManager, SpawnOptions } from "../../src/interfaces.ts";

/**
 * Mock implementation of ManagedProcess for testing
 */
export class MockManagedProcess implements ManagedProcess {
  private _pid?: number;
  private _stdin: WritableStream<Uint8Array>;
  private _stdout: ReadableStream<Uint8Array>;
  private _stderr: ReadableStream<Uint8Array>;
  private _status: Promise<ExitStatus>;
  private _killed = false;
  private _exitCode: number | null = null;
  private _exitSignal: string | null = null;

  // Controllers for streams
  private stdinController: WritableStreamDefaultController | null = null;
  private stdoutController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private stderrController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private statusResolver: ((status: ExitStatus) => void) | null = null;

  // Event tracking
  public readonly killCalls: Array<{ signal?: string; timestamp: number }> = [];
  public readonly stdinWrites: Array<{ data: Uint8Array; timestamp: number }> = [];

  constructor(pid?: number) {
    this._pid = pid;

    // Create stdin (writable)
    this._stdin = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.stdinWrites.push({ data: chunk, timestamp: Date.now() });
      },
      close: () => {
        // stdin closed
      },
      abort: () => {
        // stdin aborted
      },
    });

    // Create stdout (readable)
    this._stdout = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.stdoutController = controller;
      },
    });

    // Create stderr (readable)
    this._stderr = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.stderrController = controller;
      },
    });

    // Create status promise
    this._status = new Promise<ExitStatus>((resolve) => {
      this.statusResolver = resolve;
    });
  }

  get pid(): number | undefined {
    return this._pid;
  }

  get stdin(): WritableStream<Uint8Array> {
    return this._stdin;
  }

  get stdout(): ReadableStream<Uint8Array> {
    return this._stdout;
  }

  get stderr(): ReadableStream<Uint8Array> {
    return this._stderr;
  }

  get status(): Promise<ExitStatus> {
    return this._status;
  }

  kill(signal?: string): boolean {
    this.killCalls.push({ signal, timestamp: Date.now() });
    this._killed = true;
    return true;
  }

  // Test control methods

  /**
   * Simulate stdout data from the process
   */
  simulateStdout(data: string | Uint8Array): void {
    if (this.stdoutController) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      this.stdoutController.enqueue(bytes);
    }
  }

  /**
   * Simulate stderr data from the process
   */
  simulateStderr(data: string | Uint8Array): void {
    if (this.stderrController) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      this.stderrController.enqueue(bytes);
    }
  }

  /**
   * Simulate process exit with specified code and signal
   */
  simulateExit(code: number | null = 0, signal: string | null = null): void {
    this._exitCode = code;
    this._exitSignal = signal;

    // Close streams
    if (this.stdoutController) {
      this.stdoutController.close();
    }
    if (this.stderrController) {
      this.stderrController.close();
    }

    // Resolve status promise
    if (this.statusResolver) {
      this.statusResolver({ code, signal });
    }
  }

  /**
   * Check if process was killed
   */
  wasKilled(): boolean {
    return this._killed;
  }

  /**
   * Get the last kill signal sent
   */
  getLastKillSignal(): string | undefined {
    return this.killCalls.length > 0 ? this.killCalls[this.killCalls.length - 1].signal : undefined;
  }
}

/**
 * Mock implementation of ProcessManager for testing
 */
export class MockProcessManager implements ProcessManager {
  // Track all spawn calls
  public readonly spawnCalls: Array<{
    command: string;
    args: string[];
    options?: SpawnOptions;
    timestamp: number;
    process: MockManagedProcess;
  }> = [];

  // Control process creation
  private nextPid = 1000;
  private spawnDelay = 0;
  private shouldFailSpawn = false;

  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
    // Track spawn call even if it fails
    const spawnCall = {
      command,
      args: [...args], // Copy array
      options: options ? { ...options } : undefined, // Copy options
      timestamp: Date.now(),
      process: null as any, // Will be set below if successful
    };

    if (this.shouldFailSpawn) {
      // Record the failed spawn attempt
      this.spawnCalls.push(spawnCall);
      throw new Error(`Mock spawn failure for command: ${command}`);
    }

    const process = new MockManagedProcess(this.nextPid++);

    // Update the spawn call with the successful process
    spawnCall.process = process;

    this.spawnCalls.push(spawnCall);

    // Simulate spawn delay if configured
    if (this.spawnDelay > 0) {
      setTimeout(() => {
        // Process "started" - could emit events here
      }, this.spawnDelay);
    }

    return process;
  }

  // Test control methods

  /**
   * Set delay for spawn operations (simulates slow process startup)
   */
  setSpawnDelay(delayMs: number): void {
    this.spawnDelay = delayMs;
  }

  /**
   * Configure spawn to fail on next call
   */
  setSpawnShouldFail(shouldFail: boolean): void {
    this.shouldFailSpawn = shouldFail;
  }

  /**
   * Get the most recently spawned process
   */
  getLastSpawnedProcess(): MockManagedProcess | null {
    return this.spawnCalls.length > 0 ? this.spawnCalls[this.spawnCalls.length - 1].process : null;
  }

  /**
   * Get all spawned processes
   */
  getAllSpawnedProcesses(): MockManagedProcess[] {
    return this.spawnCalls.map((call) => call.process);
  }

  /**
   * Clear all tracking data
   */
  reset(): void {
    this.spawnCalls.length = 0;
    this.nextPid = 1000;
    this.spawnDelay = 0;
    this.shouldFailSpawn = false;
  }

  /**
   * Get spawn call count
   */
  getSpawnCallCount(): number {
    return this.spawnCalls.length;
  }

  /**
   * Check if a specific command was spawned
   */
  wasCommandSpawned(command: string): boolean {
    return this.spawnCalls.some((call) => call.command === command);
  }

  /**
   * Get spawn calls for a specific command
   */
  getSpawnCallsForCommand(command: string): typeof this.spawnCalls {
    return this.spawnCalls.filter((call) => call.command === command);
  }
}
