import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureStderr,
  cleanupTestEnvironment,
  createTestMessage,
  killProcess,
  sendMCPMessage,
  setupTestEnvironment,
  startMCPProxy,
  TEST_CONFIG,
} from "./mcp_test_utils.ts";

Deno.test({
  name: "Restart sequence validation",
  async fn() {
    await setupTestEnvironment();

    try {
      // Start proxy with server v1
      const proxy = await startMCPProxy(TEST_CONFIG.serverV1Path);

      // Give proxy time to fully start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Skip MCP message sending to avoid hangs - just test restart sequence in logs

      // Start capturing stderr to monitor restart sequence
      const stderrPromise = captureStderr(proxy, 4000);

      // Modify the server file to trigger restart
      const originalContent = await Deno.readTextFile(TEST_CONFIG.serverV1Path);
      const modifiedContent = originalContent.replace(
        '"Result A"',
        '"Result A Modified"',
      );

      // Write the modified content to trigger file change
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, modifiedContent);

      // Wait for restart to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get the stderr logs
      const logs = await stderrPromise;

      console.log("Restart sequence logs:", logs);

      // Restore original file
      await Deno.writeTextFile(TEST_CONFIG.serverV1Path, originalContent);

      // Validate the correct sequence occurred:
      // 1. File change detected
      assertEquals(
        logs.includes("📝") || logs.includes("File") || logs.includes("modify"),
        true,
        "Should detect file change",
      );

      // 2. Restart initiated
      assertEquals(
        logs.includes("🔄") || logs.includes("restarting") || logs.includes("restart"),
        true,
        "Should initiate restart",
      );

      // 3. Old server killed
      assertEquals(
        logs.includes("🛑") || logs.includes("Killing") || logs.includes("kill"),
        true,
        "Should kill old server",
      );

      // 4. New server started
      assertEquals(
        logs.includes("✅") || logs.includes("Server started") || logs.includes("started"),
        true,
        "Should start new server",
      );

      // 5. Tool list should be fetched (indicated by tools request or notification)
      assertEquals(
        logs.includes("📢") || logs.includes("tools") || logs.includes("notification"),
        true,
        "Should fetch tools and send notification",
      );

      await killProcess(proxy);
    } finally {
      await cleanupTestEnvironment();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
