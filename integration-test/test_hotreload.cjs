#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs").promises;

async function testHotReload() {
  console.log("🧪 Starting Node.js Hot-Reload Integration Test");
  
  // Kill any existing proxy
  try {
    const { execSync } = require("child_process");
    execSync("pkill -f mcpmon");
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (e) {
    // Ignore if no process to kill
  }

  // Start the proxy
  console.log("🚀 Starting mcpmon proxy...");
  const proxy = spawn("mcpmon", ["node", "test_server.cjs"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  let testPassed = false;
  
  try {
    // Wait for proxy to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("📨 Sending initialize message...");
    
    // Send initialize message
    const initMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "1.0.0" }
      }
    };

    proxy.stdin.write(JSON.stringify(initMessage) + "\n");

    // Read initial response
    const initResponse = await readResponse(proxy.stdout);
    console.log("✅ Initialize response:", JSON.stringify(initResponse, null, 2));

    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }

    // Test 1: Call tool (should return "Result A")
    console.log("🔧 Calling test_tool (expecting 'Result A')...");
    const toolMessage1 = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: { input: "test" }
      }
    };

    proxy.stdin.write(JSON.stringify(toolMessage1) + "\n");
    const toolResponse1 = await readResponse(proxy.stdout);
    const result1 = toolResponse1.result?.content?.[0]?.text || "No result";
    console.log("📥 Result 1:", result1);

    if (result1 !== "Result A") {
      throw new Error(`Expected 'Result A', got '${result1}'`);
    }

    // Trigger hot-reload by replacing the server file
    console.log("🔄 Triggering hot-reload by swapping server file...");
    const serverV2Content = await fs.readFile("mcp_server_v2.cjs", "utf8");
    await fs.writeFile("test_server.cjs", serverV2Content);

    // Wait for reload to complete
    console.log("⏳ Waiting for hot-reload to complete...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Test 2: Call tool again (should return "Result B")
    console.log("🔧 Calling test_tool again (expecting 'Result B')...");
    const toolMessage2 = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: { input: "test" }
      }
    };

    proxy.stdin.write(JSON.stringify(toolMessage2) + "\n");
    const toolResponse2 = await readResponse(proxy.stdout);
    const result2 = toolResponse2.result?.content?.[0]?.text || "No result";
    console.log("📥 Result 2:", result2);

    if (result2 !== "Result B") {
      throw new Error(`Expected 'Result B', got '${result2}'`);
    }

    // Success!
    console.log("🎉 SUCCESS: Hot-reload integration test passed!");
    console.log(`   Before reload: ${result1}`);
    console.log(`   After reload:  ${result2}`);
    testPassed = true;

  } catch (error) {
    console.error("❌ FAILED:", error.message);
  } finally {
    // Cleanup
    console.log("🧹 Cleaning up...");
    proxy.kill("SIGTERM");
    
    // Restore original server
    try {
      const { execSync } = require("child_process");
      execSync("cp mcp_server_v1.cjs test_server.cjs", { stdio: "ignore" });
    } catch (e) {
      // Copy files manually if cp fails
      const v1Content = await fs.readFile("tests/fixtures/mcp_server_v1.js", "utf8");
      await fs.writeFile("test_server.cjs", v1Content);
    }
  }

  return testPassed;
}

function readResponse(stdout) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for response"));
    }, 10000);

    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const response = JSON.parse(line);
            clearTimeout(timeout);
            stdout.off("data", onData);
            resolve(response);
            return;
          } catch (e) {
            // Not JSON, continue
          }
        }
      }
      
      // Keep the last incomplete line
      buffer = lines[lines.length - 1];
    };

    stdout.on("data", onData);
  });
}

// Copy v1 to test_server.cjs if not exists
async function setup() {
  try {
    await fs.access("test_server.cjs");
  } catch (e) {
    // File doesn't exist, copy from v1
    const { execSync } = require("child_process");
    execSync("cp ../tests/fixtures/mcp_server_v1.js test_server.cjs");
    execSync("cp ../tests/fixtures/mcp_server_v2.js mcp_server_v2.cjs");
  }
}

if (require.main === module) {
  setup().then(() => testHotReload()).then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error("Test setup failed:", error);
    process.exit(1);
  });
}

module.exports = testHotReload;