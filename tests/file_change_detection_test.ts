import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  setupTestEnvironment, 
  cleanupTestEnvironment, 
  startMCPProxy, 
  killProcess, 
  captureStderr,
  assertRestartSequence,
  TEST_CONFIG
} from "./mcp_test_utils.ts";

Deno.test({
  name: "File change detection workflow",
  async fn() {
    await setupTestEnvironment();
    
    try {
      // Start proxy with server v1
      const proxy = await startMCPProxy(TEST_CONFIG.serverV1Path);
      
      // Give proxy time to fully start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start capturing stderr to monitor restart behavior
      const stderrPromise = captureStderr(proxy, 3000);
      
      // Modify the server file to trigger restart
      const originalContent = await Deno.readTextFile(TEST_CONFIG.serverV1Path);
      const modifiedContent = originalContent.replace(
        '[Server v1] MCP Test Server v1 started',
        '[Server v1] MCP Test Server v1 started (MODIFIED)'
      );
      
      // Write the modified content to trigger file change
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);
      
      // Wait for restart to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the stderr logs
      const logs = await stderrPromise;
      
      // Restore original file
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, originalContent);
      
      // Verify restart sequence occurred
      assertRestartSequence(logs);
      
      // Verify the file was actually being watched
      assertEquals(logs.includes(TEST_CONFIG.serverV1Path) || logs.includes("Watching"), true, 
        "Should be watching the server file");
      
      await killProcess(proxy);
      
    } finally {
      await cleanupTestEnvironment();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false
});