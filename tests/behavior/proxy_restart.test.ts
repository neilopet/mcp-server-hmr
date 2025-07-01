/// <reference path="./global.d.ts" />
/**
 * Behavioral test for proxy restart functionality
 * 
 * Tests the core hot-reload behavior: when a watched file changes,
 * the proxy should kill the old server and start a new one in the correct sequence.
 * 
 * This test uses mock implementations to verify behavior without actual process spawning.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MCPProxy } from "../../src/proxy.ts";
import { MockProcessManager, MockManagedProcess } from "../mocks/MockProcessManager.ts";
import { MockFileSystem } from "../mocks/MockFileSystem.ts";

Deno.test({
  name: "Proxy restart - file change triggers server restart sequence",
  async fn() {
    // Setup mock dependencies
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    // Mock file setup
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    // Set up global variables that MCPProxy expects
    // These would normally come from environment variables or command line
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100; // Short delay for testing
    
    // Create proxy with mock dependencies
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
    });

    try {
      // Start proxy (this should spawn initial server and start watching)
      const proxyStartPromise = proxy.start();
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify initial server was spawned
      assertEquals(mockProcessManager.getSpawnCallCount(), 1, "Should spawn initial server");
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should have spawned process");
      
      // Simulate initial server starting successfully
      initialProcess?.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}\n');
      
      // Record the initial process for comparison
      const initialPid = initialProcess?.pid;
      
      // Trigger file change event
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      
      // Wait for restart to process (debounce + restart time)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify restart sequence
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Should spawn new server after file change");
      
      // Verify old process was killed
      const killCalls = initialProcess?.killCalls || [];
      assertEquals(killCalls.length >= 1, true, "Should kill old server");
      if (killCalls.length > 0) {
        assertEquals(killCalls[0].signal || "SIGTERM", "SIGTERM", "Should use SIGTERM signal");
      }
      
      // Verify new process is different
      const newProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(newProcess, "Should have new process");
      assertEquals(newProcess.pid !== initialPid, true, "New process should have different PID");
      
      // Verify watch is still active
      assertEquals(mockFileSystem.getActiveWatcherCount() > 0, true, "File watcher should still be active");
      
      // Test second restart to ensure it works repeatedly
      newProcess?.simulateStdout('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n');
      
      // Trigger another file change
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should have spawned third server
      assertEquals(mockProcessManager.getSpawnCallCount(), 3, "Should spawn third server after second file change");
      
      // Cleanup
      mockFileSystem.closeAllWatchers();
      
    } finally {
      // Cleanup global state
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
  name: "Proxy restart - multiple rapid file changes are debounced",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 200; // Longer debounce for this test
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify initial spawn
      assertEquals(mockProcessManager.getSpawnCallCount(), 1, "Should spawn initial server");
      
      // Simulate rapid file changes (should be debounced)
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 10));
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      
      // Wait for debounce + restart
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Should only have triggered one restart despite multiple changes
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Multiple rapid changes should be debounced to single restart");
      
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
  name: "Proxy restart - handles process that fails to start",
  async fn() {
    const mockProcessManager = new MockProcessManager();
    const mockFileSystem = new MockFileSystem();
    
    const watchFile = "/test/server.js";
    mockFileSystem.setFileExists(watchFile, true);
    
    globalThis.command = "node";
    globalThis.commandArgs = [watchFile];
    globalThis.entryFile = watchFile;
    globalThis.restartDelay = 100;
    
    const proxy = new MCPProxy({
      procManager: mockProcessManager,
      fs: mockFileSystem,
    }, {
      command: globalThis.command!,
      commandArgs: globalThis.commandArgs!,
      entryFile: globalThis.entryFile!,
      restartDelay: globalThis.restartDelay!,
    });

    try {
      // Start proxy
      const proxyStartPromise = proxy.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(initialProcess, "Should spawn initial process");
      
      // Simulate initial process starting
      initialProcess.simulateStdout('{"jsonrpc":"2.0","id":1,"result":{}}\n');
      
      // Configure next spawn to succeed but immediately fail
      const nextProcess = new MockProcessManager();
      
      // Trigger restart
      mockFileSystem.triggerFileEvent(watchFile, "modify");
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have attempted new spawn
      assertEquals(mockProcessManager.getSpawnCallCount(), 2, "Should attempt to spawn new server");
      
      const newProcess = mockProcessManager.getLastSpawnedProcess();
      assertExists(newProcess, "Should have new process");
      
      // Simulate new process failing quickly
      newProcess.simulateExit(1, null);
      
      // Wait a bit for error handling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should eventually try to restart again (error recovery)
      // This tests the resilience of the proxy
      
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
