import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanupTestEnvironment, setupTestEnvironment, TEST_CONFIG } from "./mcp_test_utils.ts";

// Test E2E using the ORIGINAL working proxy architecture
async function testWithOriginalWorkingProxy(
  targetServerPath: string,
  v1Content: string,
  v2Content: string,
): Promise<boolean> {
  // Start with v1 content
  await Deno.writeTextFile(targetServerPath, v1Content);

  try {
    // Use our actual production implementation with command line arguments
    const proxyProcess = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-env",
        "--allow-read",
        "--allow-run",
        "src/main.ts",
        "node",
        targetServerPath,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    // Give proxy time to start the target server
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if proxy is still running
    try {
      const status = proxyProcess.status;
      // If status resolves immediately, process has exited
      const hasExited = await Promise.race([
        status.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 100)),
      ]);

      if (hasExited) {
        const exitStatus = await status;
        console.log("❌ Proxy exited immediately with code:", exitStatus.code);

        // Read stderr to see what went wrong
        const stderrReader = proxyProcess.stderr.getReader();
        const { value: stderrValue } = await stderrReader.read();
        if (stderrValue) {
          const stderrText = new TextDecoder().decode(stderrValue);
          console.log("Stderr output:", stderrText);
        }
        stderrReader.releaseLock();
        return false;
      }
    } catch (error) {
      // Process is still running, which is good
    }

    console.log("✅ Started production proxy with target server");

    // Send initialize message to proxy (which forwards to server)
    const initMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    };

    // Send and read through proxy
    const writer = proxyProcess.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(initMessage) + "\n"));
    writer.releaseLock();

    const reader = proxyProcess.stdout.getReader();
    const { value: initValue } = await reader.read();
    reader.releaseLock();

    if (!initValue || initValue.length === 0) {
      console.log("❌ No response received from proxy during initialize");
      proxyProcess.kill("SIGTERM");
      return false;
    }

    const initText = new TextDecoder().decode(initValue);
    console.log("Initialize response raw:", initText);

    let initResponse;
    try {
      initResponse = JSON.parse(initText.trim());
    } catch (error) {
      console.log("❌ Failed to parse initialize response:", error.message);
      console.log("Raw response length:", initValue.length);
      proxyProcess.kill("SIGTERM");
      return false;
    }

    if (initResponse.error) {
      console.log("❌ Initialize failed:", initResponse.error);
      proxyProcess.kill("SIGTERM");
      return false;
    }

    console.log("✅ Successfully initialized through original proxy");

    // Test 1: Call tool - should get "Result A"
    console.log("Calling test_tool through original proxy (expecting 'Result A')...");
    const toolMessage1 = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: { input: "test" },
      },
    };

    const writer1 = proxyProcess.stdin.getWriter();
    await writer1.write(new TextEncoder().encode(JSON.stringify(toolMessage1) + "\n"));
    writer1.releaseLock();

    const reader1 = proxyProcess.stdout.getReader();
    const { value: result1Value } = await reader1.read();
    const toolResponse1 = JSON.parse(new TextDecoder().decode(result1Value!));
    reader1.releaseLock();

    const text1 = toolResponse1.result?.content?.[0]?.text || "No result";
    console.log("Initial result:", text1);

    // Trigger hot-reload by swapping to v2 content
    console.log("Swapping to server v2 content to trigger hot-reload...");
    await Deno.writeTextFile(targetServerPath, v2Content);

    // Wait for file change detection and reload - look for restart completion in stderr
    console.log("Waiting for hot-reload...");

    // Monitor stderr for restart completion signal
    let restartComplete = false;
    const stderrReader = proxyProcess.stderr.getReader();
    const startTime = Date.now();

    while (!restartComplete && (Date.now() - startTime) < 10000) {
      try {
        const { value: stderrValue } = await Promise.race([
          stderrReader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ value: null }), 500)),
        ]) as any;

        if (stderrValue) {
          const stderrText = new TextDecoder().decode(stderrValue);
          console.log("STDERR:", stderrText);

          if (stderrText.includes("✅ Server restart complete")) {
            restartComplete = true;
            console.log("🎉 Detected restart completion!");
            break;
          }
        }
      } catch (error) {
        // Continue waiting
      }
    }

    stderrReader.releaseLock();

    if (!restartComplete) {
      console.log("⚠️  Timeout waiting for restart completion");
    }

    // Additional wait to ensure everything is stable
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Start a continuous reader to capture the tool response
    const stdoutReader = proxyProcess.stdout.getReader();
    let toolResponse2: any = null;
    let responseFound = false;

    // Function to read and parse responses continuously
    const readResponses = async () => {
      try {
        while (!responseFound) {
          const { value, done } = await stdoutReader.read();
          if (done) break;

          const text = new TextDecoder().decode(value);
          const lines = text.trim().split("\n");

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                // Look for our tool call response (id=10)
                if (parsed.id === 10 && parsed.result) {
                  toolResponse2 = parsed;
                  responseFound = true;
                  return;
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
        }
      } catch (error) {
        console.log("Reader error:", error.message);
      }
    };

    // Start reading responses in background
    const readPromise = readResponses();

    // Give it a moment to start reading
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test 2: Call tool again with fresh ID - should get "Result B"
    console.log("Calling test_tool again through original proxy (expecting 'Result B')...");
    const toolMessage2 = {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: { input: "test" },
      },
    };

    const writer2 = proxyProcess.stdin.getWriter();
    await writer2.write(new TextEncoder().encode(JSON.stringify(toolMessage2) + "\n"));
    writer2.releaseLock();

    // Wait for response with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tool call timeout")), 5000)
    );

    try {
      await Promise.race([readPromise, timeout]);
    } catch (error) {
      console.log("❌ Timeout waiting for tool response:", error.message);
      stdoutReader.releaseLock();
      proxyProcess.kill("SIGTERM");
      return false;
    }

    stdoutReader.releaseLock();

    if (!toolResponse2) {
      console.log("❌ No tool response found");
      proxyProcess.kill("SIGTERM");
      return false;
    }

    const text2 = toolResponse2.result?.content?.[0]?.text || "No result";
    console.log("Reloaded result:", text2);

    // Verify the tool response actually changed
    const success = text1 === "Result A" && text2 === "Result B";

    if (success) {
      console.log("🎉 SUCCESS: Hot-reload changed tool response from 'Result A' to 'Result B'!");
    } else {
      console.log(`❌ FAILED: Expected 'Result A' → 'Result B', got '${text1}' → '${text2}'`);
    }

    // Cleanup proxy
    proxyProcess.kill("SIGTERM");
    await proxyProcess.status;

    return success;
  } finally {
    // Restore original content
    await Deno.writeTextFile(targetServerPath, v1Content);
  }
}

Deno.test({
  name: "E2E MCP Client → Proxy → Target Server with hot-reload",
  async fn() {
    await setupTestEnvironment();

    try {
      const targetServerPath = TEST_CONFIG.serverV1Path;
      const serverV1Content = await Deno.readTextFile(TEST_CONFIG.serverV1Path);
      const serverV2Content = await Deno.readTextFile(TEST_CONFIG.serverV2Path);

      console.log("Testing E2E: MCP Client → Proxy → Target Server");
      console.log("Architecture: Client drives Proxy via STDIO, Proxy watches target server file");

      const toolResponsesChanged = await testWithOriginalWorkingProxy(
        targetServerPath,
        serverV1Content,
        serverV2Content,
      );

      assertEquals(
        toolResponsesChanged,
        true,
        "Tool call responses should change from 'Result A' to 'Result B' after hot-reload",
      );

      console.log("✅ TRUE E2E VERIFICATION PASSED!");
      console.log("🎉 MCP Client successfully confirmed hot-reload changes tool results:");
      console.log("   Client calls tool → 'Result A'");
      console.log("   File swap triggers hot-reload");
      console.log("   Client calls tool → 'Result B'");
    } finally {
      await cleanupTestEnvironment();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
