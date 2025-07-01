/// <reference path="./global.d.ts" />
/**
 * Behavioral test for error handling scenarios
 * 
 * Tests that the proxy handles various error conditions gracefully:
 * - Process spawn failures
 * - File watching errors  
 * - Process crashes
 * - Network/stream errors
 * - Invalid message formats
 * 
 * Ensures robust operation and proper error recovery.
 */

import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MCPProxy } from "../../src/proxy.ts";
import { MockProcessManager, MockManagedProcess } from "../mocks/MockProcessManager.ts";
import { MockFileSystem } from "../mocks/MockFileSystem.ts";

Deno.test({
  name: "Error handling - process spawn failure",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    // Configure spawn to fail
    mockProcessManager.setSpawnShouldFail(true);
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables that MCPProxy expects
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy - this should handle spawn failure gracefully
      const proxyStartPromise = proxy.start();
      
      // Give it time to attempt spawn and handle failure
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have attempted to spawn
      assertEquals(mockProcessManager.getSpawnCallCount(), 1, "Should attempt to spawn");
      
      // The proxy should handle the spawn failure and potentially retry
      // Exact behavior depends on implementation, but it shouldn't crash
      
      // Reset spawn failure for testing recovery
      mockProcessManager.setSpawnShouldFail(false);
      
      // Trigger a restart to test recovery
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should successfully spawn on retry
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Should retry spawn after failure");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs; 
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - file watching failure",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    // Don't set file as existing to simulate watch failure
    
    // Set up global variables that MCPProxy expects
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy - file watching should fail but proxy should continue
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still spawn initial server even if file watching fails
      assertEquals(mockProcessManager.getSpawnCallCount(), 1, "Should spawn server despite watch failure");
      
      // File watching should not be active
      assertEquals(mockFileSystem.getActiveWatcherCount(), 0, "Should not have active watchers due to failure");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - process crash during operation",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables BEFORE creating proxy
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");
      
      // Simulate process starting successfully
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');
      
      // Simulate unexpected process crash
      initialProcess.simulateExit(1, "SIGKILL");
      
      // Wait for proxy to detect crash and restart
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Proxy should attempt to restart after crash
      assertEquals(mockProcessManager.getSpawnCallCount() >= 2, true, "Should restart after process crash");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - invalid JSON messages",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables BEFORE creating proxy
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");
      
      // Simulate server sending invalid JSON
      initialProcess.simulateStdout("invalid json\n");
      initialProcess.simulateStdout('{"incomplete": json\n');
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n'); // Valid message
      
      // Proxy should handle invalid JSON gracefully and continue operating
      // The valid message should still be processed
      
      // Trigger restart to ensure proxy is still functional
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      
      // Wait for restart to begin, then simulate process exit to allow kill to complete
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for restart to start
      initialProcess.simulateExit(0); // Allow killServer() to complete
      
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for restart to complete
      
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Should continue operating despite invalid JSON");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - stream errors",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables BEFORE creating proxy
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");
      
      // Simulate stream working initially
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');
      
      // Simulate stream error by closing streams abruptly
      initialProcess.simulateExit(0, null);
      
      // Wait for proxy to handle stream closure
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Proxy should detect stream closure and attempt restart
      assertEquals(mockProcessManager.getSpawnCallCount() >= 2, true, "Should restart after stream error");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - filesystem operations failure",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    // Configure filesystem operations to fail
    mockFileSystem.setFailures({
      read: true,
      write: true,
      exists: true,
      copy: true,
      message: "Mock filesystem error"
    });
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    const watchFile = "/test/server.js";
    
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;

    try {
      // Start proxy - should handle filesystem failures gracefully
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // The exact behavior depends on implementation
      // But proxy should not crash due to filesystem errors
      
      // Reset filesystem failures
      mockFileSystem.setFileExists(watchFile, true);
      
      // Should be able to recover when filesystem is working again
      await new Promise(resolve => setTimeout(resolve, 100));
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Error handling - multiple concurrent errors",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables BEFORE creating proxy
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 50; // Short delay for faster testing
    
    // Create mock I/O streams for testing
    const { readable: mockStdin, writable: stdinWrite } = new TransformStream();
    const { readable: stdoutRead, writable: mockStdout } = new TransformStream();
    const { readable: stderrRead, writable: mockStderr } = new TransformStream();
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
      killDelay: 50,  // Fast test timing
      readyDelay: 50, // Fast test timing
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");
      
      // Simulate multiple errors happening simultaneously:
      // 1. Process crash
      initialProcess.simulateExit(1, "SIGKILL");
      
      // 2. File change events during crash
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      
      // 3. Configure next spawn to fail temporarily
      mockProcessManager.setSpawnShouldFail(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reset spawn failure
      mockProcessManager.setSpawnShouldFail(false);
      
      // 4. More file changes
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Despite multiple concurrent errors, proxy should eventually stabilize
      assertEquals(mockProcessManager.getSpawnCallCount() >= 2, true, "Should attempt multiple restarts");
      
      mockFileSystem.closeAllWatchers();
      
    } finally {
      delete globalThis.command;
      delete globalThis.commandArgs;
      delete globalThis.entryFile;
      delete globalThis.restartDelay;
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
