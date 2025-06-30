import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  setupTestEnvironment, 
  cleanupTestEnvironment, 
  startMCPProxy, 
  killProcess, 
  captureStderr,
  TEST_CONFIG
} from "./mcp_test_utils.ts";

Deno.test({
  name: "Debouncing - multiple rapid changes trigger only one restart",
  async fn() {
    await setupTestEnvironment();
    
    try {
      // Start proxy with server v1
      const proxy = await startMCPProxy(TEST_CONFIG.serverV1Path);
      
      // Give proxy time to fully start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start capturing stderr to monitor debouncing behavior
      const stderrPromise = captureStderr(proxy, 6000);
      
      // Store original content
      const originalContent = await Deno.readTextFile(TEST_CONFIG.serverV1Path);
      
      // Make rapid successive changes to trigger debouncing
      console.log("Making rapid successive file changes...");
      
      // Change 1
      let modifiedContent = originalContent.replace(
        '[Server v1] MCP Test Server v1 started',
        '[Server v1] MCP Test Server v1 started (CHANGE 1)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait minimal time between changes (should be within debounce window)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Change 2
      modifiedContent = modifiedContent.replace(
        '(CHANGE 1)',
        '(CHANGE 2)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait minimal time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Change 3
      modifiedContent = modifiedContent.replace(
        '(CHANGE 2)',
        '(CHANGE 3)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait minimal time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Change 4
      modifiedContent = modifiedContent.replace(
        '(CHANGE 3)',
        '(CHANGE 4)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait minimal time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Change 5 - Final change
      modifiedContent = modifiedContent.replace(
        '(CHANGE 4)',
        '(CHANGE 5 FINAL)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      console.log("All changes made, waiting for debounced restart...");
      
      // Wait for debounce period and restart to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get the stderr logs
      const logs = await stderrPromise;
      
      console.log("Debouncing logs:", logs);
      
      // Restore original file
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, originalContent);
      
      // Count restart sequences in logs
      const restartCount = (logs.match(/🔄|restarting|restart/g) || []).length;
      const killCount = (logs.match(/🛑|Killing|kill/g) || []).length;
      const startCount = (logs.match(/✅|Server started|started/g) || []).length;
      
      console.log(`Restart indicators: ${restartCount}, Kill indicators: ${killCount}, Start indicators: ${startCount}`);
      
      // Verify debouncing behavior:
      // 1. Should see significantly fewer restarts than file changes (5 changes made)
      assertEquals(restartCount < 5, true, 
        `Should have fewer restarts (${restartCount}) than file changes (5) due to debouncing`);
        
      // 2. Should not see 5 separate kill operations  
      assertEquals(killCount < 5, true,
        `Should not see 5 kill operations (saw ${killCount}) for rapid changes`);
        
      // 3. Should detect multiple file changes
      const fileChangeCount = (logs.match(/📝|File modify/g) || []).length;
      assertEquals(fileChangeCount >= 5, true,
        `Should detect all 5 file changes (detected ${fileChangeCount})`);
        
      // 4. Final restart should complete successfully
      assertEquals(logs.includes("✅") || logs.includes("Server started") || logs.includes("started"), true,
        "Should complete final restart successfully");
        
      // 5. Should consolidate multiple file changes into fewer restarts
      assertEquals(fileChangeCount > restartCount, true,
        `File changes (${fileChangeCount}) should be more than restarts (${restartCount})`);
        
      await killProcess(proxy);
      
    } finally {
      await cleanupTestEnvironment();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Debouncing - spaced changes trigger separate restarts",
  async fn() {
    await setupTestEnvironment();
    
    try {
      // Start proxy with server v1
      const proxy = await startMCPProxy(TEST_CONFIG.serverV1Path);
      
      // Give proxy time to fully start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start capturing stderr
      const stderrPromise = captureStderr(proxy, 8000);
      
      // Store original content
      const originalContent = await Deno.readTextFile(TEST_CONFIG.serverV1Path);
      
      console.log("Making first change...");
      
      // First change
      let modifiedContent = originalContent.replace(
        '[Server v1] MCP Test Server v1 started',
        '[Server v1] MCP Test Server v1 started (FIRST CHANGE)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait long enough for debounce period to expire and restart to complete
      console.log("Waiting for first restart to complete...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log("Making second change...");
      
      // Second change - after debounce period
      modifiedContent = modifiedContent.replace(
        '(FIRST CHANGE)',
        '(SECOND CHANGE)'
      );
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait for second restart to complete
      console.log("Waiting for second restart to complete...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get the stderr logs
      const logs = await stderrPromise;
      
      console.log("Spaced changes logs:", logs);
      
      // Restore original file
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, originalContent);
      
      // Count restart sequences
      const restartCount = (logs.match(/🔄|restarting|restart/g) || []).length;
      const killCount = (logs.match(/🛑|Killing|kill/g) || []).length;
      
      console.log(`Restart indicators: ${restartCount}, Kill indicators: ${killCount}`);
      
      // Verify spaced changes behavior:
      // 1. Should see 2 separate restart sequences for spaced changes
      assertEquals(restartCount >= 2, true,
        "Should see 2 separate restart sequences for spaced changes");
        
      // 2. Should see 2 separate kill operations
      assertEquals(killCount >= 2, true,
        "Should see 2 separate kill operations for spaced changes");
        
      // 3. Both restarts should complete successfully
      const startCount = (logs.match(/✅|Server started|started/g) || []).length;
      assertEquals(startCount >= 2, true,
        "Both restarts should complete successfully");
        
      await killProcess(proxy);
      
    } finally {
      await cleanupTestEnvironment();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false
});