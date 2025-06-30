import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Utilities for testing MCP Server HMR functionality
 */

export interface TestConfig {
  testDir: string;
  serverV1Path: string;
  serverV2Path: string;
  clientPath: string;
}

export const TEST_CONFIG: TestConfig = {
  testDir: "./tests/temp",
  serverV1Path: "./tests/fixtures/mcp_server_v1.js",
  serverV2Path: "./tests/fixtures/mcp_server_v2.js", 
  clientPath: "./tests/fixtures/mcp_client.js"
};

/**
 * Setup test environment - create temp directories and clean up from previous runs
 */
export async function setupTestEnvironment(): Promise<void> {
  try {
    await Deno.remove(TEST_CONFIG.testDir, { recursive: true });
  } catch {
    // Directory might not exist
  }
  await Deno.mkdir(TEST_CONFIG.testDir, { recursive: true });
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(): Promise<void> {
  try {
    await Deno.remove(TEST_CONFIG.testDir, { recursive: true });
  } catch {
    // Directory might not exist
  }
}

/**
 * Start MCP proxy with specified server file
 */
export async function startMCPProxy(serverPath: string): Promise<Deno.ChildProcess> {
  const env = new Map(Object.entries(Deno.env.toObject()));
  env.set("MCP_SERVER_COMMAND", "node");
  env.set("MCP_SERVER_ARGS", serverPath);
  
  const process = new Deno.Command("deno", {
    args: ["run", "--allow-env", "--allow-read", "--allow-run", "src/main.ts"],
    env: Object.fromEntries(env),
    stdin: "piped",
    stdout: "piped",
    stderr: "piped"
  }).spawn();
  
  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return process;
}

/**
 * Send MCP message to proxy and get response
 */
export async function sendMCPMessage(
  process: Deno.ChildProcess, 
  message: unknown
): Promise<unknown> {
  const writer = process.stdin.getWriter();
  const messageStr = JSON.stringify(message) + "\n";
  await writer.write(new TextEncoder().encode(messageStr));
  writer.releaseLock();
  
  // Read response
  const reader = process.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  
  if (value) {
    const responseStr = new TextDecoder().decode(value);
    return JSON.parse(responseStr.trim());
  }
  
  throw new Error("No response received");
}

/**
 * Wait for proxy to fully restart after file change
 */
export async function waitForRestart(delayMs = 1000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Capture stderr output from a process for a specified duration
 */
export async function captureStderr(
  process: Deno.ChildProcess, 
  durationMs = 1000
): Promise<string> {
  const reader = process.stderr.getReader();
  const chunks: Uint8Array[] = [];
  
  const timeout = setTimeout(() => {
    reader.releaseLock();
  }, durationMs);
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
    }
  } catch {
    // Reader was likely cancelled by timeout
  }
  
  clearTimeout(timeout);
  
  const combined = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  return new TextDecoder().decode(combined);
}

/**
 * Kill process and wait for it to exit
 */
export async function killProcess(process: Deno.ChildProcess): Promise<void> {
  try {
    process.kill("SIGTERM");
    await process.status;
  } catch {
    // Process might already be dead
  }
}

/**
 * Assert that log contains expected restart sequence messages
 */
export function assertRestartSequence(logs: string): void {
  // Check for file change detection
  assertEquals(logs.includes("📝 File modify") || logs.includes("File change detected"), true, 
    "Should detect file change");
    
  // Check for restart sequence
  assertEquals(logs.includes("🔄") || logs.includes("restarting"), true,
    "Should show restart message");
    
  // Check for server kill/start
  assertEquals(logs.includes("🛑") || logs.includes("Killing server"), true,
    "Should kill old server");
    
  assertEquals(logs.includes("✅") || logs.includes("Server started"), true,
    "Should start new server");
}

/**
 * Create a simple test MCP message
 */
export function createTestMessage(method: string, params?: unknown): unknown {
  return {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1000),
    method,
    params: params || {}
  };
}

/**
 * Validate MCP response format
 */
export function validateMCPResponse(response: unknown): void {
  assertExists(response);
  const resp = response as Record<string, unknown>;
  assertEquals(resp.jsonrpc, "2.0");
  assertExists(resp.id);
}