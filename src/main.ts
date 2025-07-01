#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run
/**
 * MCP Server HMR
 *
 * Hot Module Replacement for MCP servers - instant reloading on file changes.
 * Configure via environment variables in .env file.
 */

import { debounce, type DebouncedFunction } from "std/async/debounce.ts";
import { load } from "std/dotenv/mod.ts";

// Check if we have command line arguments (for testing) or use environment variables (for production)
// Note: We check command line args first before loading .env to avoid env validation errors in test mode
let command: string;
let commandArgs: string[] = [];
let entryFile: string | null = null;
let restartDelay: number = 300;

if (Deno.args.length > 0) {
  // Command line mode (for testing)
  console.error("🧪 Using command line arguments mode");
  let i = 0;
  command = Deno.args[i++];
  while (i < Deno.args.length) {
    commandArgs.push(Deno.args[i++]);
  }
  
  // Determine entry file for command line mode
  if (command === "node" && commandArgs.length > 0) {
    entryFile = commandArgs[0];
  } else if (command === "deno" && commandArgs.includes("run")) {
    const runIndex = commandArgs.indexOf("run");
    for (let j = runIndex + 1; j < commandArgs.length; j++) {
      if (!commandArgs[j].startsWith("-")) {
        entryFile = commandArgs[j];
        break;
      }
    }
  } else if (command === "python" && commandArgs.length > 0) {
    entryFile = commandArgs[0];
  }
} else {
  // Environment variable mode (for production)
  console.error("🔧 Using environment variables mode");
  
  // Load environment variables from .env file (only in env mode)
  await load();
  
  const serverCommand = Deno.env.get("MCP_SERVER_COMMAND");
  const serverArgs = Deno.env.get("MCP_SERVER_ARGS");
  const watchFile = Deno.env.get("MCP_WATCH_FILE");
  restartDelay = parseInt(Deno.env.get("MCP_RESTART_DELAY") || "300");

  // Validate required configuration
  if (!serverCommand) {
    console.error("❌ MCP_SERVER_COMMAND environment variable is required");
    console.error("💡 Copy .env.example to .env and configure your server");
    Deno.exit(1);
  }

  if (!serverArgs) {
    console.error("❌ MCP_SERVER_ARGS environment variable is required");
    console.error("💡 Set the path to your MCP server script");
    Deno.exit(1);
  }

  command = serverCommand;
  commandArgs = serverArgs.split(" ").filter((arg) => arg.trim() !== "");
  entryFile = watchFile || null;
}

if (!entryFile) {
  // Auto-detect entry file based on command
  if (command === "node" && commandArgs.length > 0) {
    entryFile = commandArgs[commandArgs.length - 1]; // Last arg for node
  } else if (command === "deno" && commandArgs.includes("run")) {
    const runIndex = commandArgs.indexOf("run");
    for (let j = runIndex + 1; j < commandArgs.length; j++) {
      if (!commandArgs[j].startsWith("-")) {
        entryFile = commandArgs[j];
        break;
      }
    }
  } else if (command === "python" && commandArgs.length > 0) {
    entryFile = commandArgs[commandArgs.length - 1]; // Last arg for python
  }
}

console.error(`🚀 Starting MCP Server HMR`);
console.error(`📟 Server: ${command} ${commandArgs.join(" ")}`);
if (entryFile) {
  console.error(`👀 Watching: ${entryFile}`);
} else {
  console.error(`⚠️  No entry file detected - hot-reload disabled`);
}

interface Message {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class MCPProxy {
  private serverProcess: Deno.ChildProcess | null = null;
  private serverPid: number | null = null;
  private stdinBuffer: Uint8Array[] = [];
  private messageBuffer: Message[] = [];
  private restarting = false;
  private stdinReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private currentRequestId = 1;
  private initializeParams: unknown = null;
  private pendingRequests = new Map<number, (response: Message) => void>();

  async start() {
    // Start initial server
    await this.startServer();

    // Setup continuous stdin forwarding
    this.setupStdinForwarding();

    // Start file watcher if we have an entry file
    if (entryFile) {
      this.startWatcher();
    }

    // Keep proxy running - don't exit when server exits during hot-reload
    // The proxy manages the server lifecycle, not the other way around
    while (true) {
      if (this.serverProcess && !this.restarting) {
        try {
          const status = await this.serverProcess.status;
          if (!this.restarting) {
            console.error(`⚠️  Server exited unexpectedly with code: ${status.code}`);
            console.error(`🔄 Restarting server...`);
            await this.startServer();
            this.setupStdinForwarding();
          }
        } catch (error) {
          if (!this.restarting) {
            console.error(`❌ Server process error: ${error}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.startServer();
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async startServer() {
    console.error("🚀 Starting MCP server...");

    this.serverProcess = new Deno.Command(command, {
      args: commandArgs,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      env: Deno.env.toObject(), // Pass all environment variables
    }).spawn();

    this.serverPid = this.serverProcess.pid;
    console.error(`✅ Server started with PID: ${this.serverPid}`);

    // Setup output forwarding
    this.setupOutputForwarding();

    // Replay buffered messages
    if (this.messageBuffer.length > 0) {
      console.error(`📨 Replaying ${this.messageBuffer.length} buffered messages...`);
      const writer = this.serverProcess.stdin.getWriter();

      for (const msg of this.messageBuffer) {
        const data = new TextEncoder().encode(JSON.stringify(msg) + "\n");
        await writer.write(data);
      }

      writer.releaseLock();
      this.messageBuffer = [];
    }
  }

  private async killServer() {
    if (!this.serverProcess || !this.serverPid) return;

    console.error(`🛑 Killing server process ${this.serverPid}...`);

    try {
      // First try SIGTERM
      this.serverProcess.kill("SIGTERM");

      // Wait up to 5 seconds for graceful shutdown
      const timeout = setTimeout(() => {
        console.error("⚠️  Server didn't exit gracefully, sending SIGKILL...");
        this.serverProcess?.kill("SIGKILL");
      }, 5000);

      await this.serverProcess.status;
      clearTimeout(timeout);

      // Verify process is actually dead
      await this.verifyProcessKilled(this.serverPid);

      console.error(`✅ Server process ${this.serverPid} terminated`);
    } catch (error) {
      console.error(`❌ Error killing server: ${error}`);
    }

    this.serverProcess = null;
    this.serverPid = null;
  }

  private async verifyProcessKilled(pid: number) {
    // Try to check if process still exists
    try {
      // On Unix systems, sending signal 0 checks if process exists
      await new Deno.Command("kill", { args: ["-0", pid.toString()] }).output();
      // If we get here, process still exists
      console.error(`⚠️  Process ${pid} still running, forcing kill...`);
      await new Deno.Command("kill", { args: ["-9", pid.toString()] }).output();
    } catch {
      // Process doesn't exist, which is what we want
    }
  }

  private setupStdinForwarding() {
    (async () => {
      const reader = Deno.stdin.readable.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete JSON-RPC messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message: Message = JSON.parse(line);

                // Capture initialize params for replay
                if (message.method === "initialize") {
                  this.initializeParams = message.params;
                  console.error("📋 Captured initialize params for replay");
                }

                // During restart, buffer all messages
                if (this.restarting) {
                  this.messageBuffer.push(message);
                  console.error(
                    `📦 Buffered message during restart: ${
                      message.method || `response ${message.id}`
                    }`,
                  );
                } else if (this.serverProcess) {
                  // Forward to server
                  const writer = this.serverProcess.stdin.getWriter();
                  await writer.write(new TextEncoder().encode(line + "\n"));
                  writer.releaseLock();
                }
              } catch (e) {
                console.error("Failed to parse message:", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("Stdin forwarding error:", error);
      }
    })();
  }

  private setupOutputForwarding() {
    if (!this.serverProcess) return;

    // Forward stdout
    (async () => {
      const reader = this.serverProcess!.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // During restart, we still forward output to maintain connection
          const text = decoder.decode(value, { stream: true });
          await Deno.stdout.write(value);

          // Also parse messages to handle responses
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message: Message = JSON.parse(line);
                if (message.id && this.pendingRequests.has(message.id)) {
                  const handler = this.pendingRequests.get(message.id)!;
                  this.pendingRequests.delete(message.id);
                  handler(message);
                }
              } catch {
                // Not JSON, ignore
              }
            }
          }
        }
      } catch (error) {
        if (!this.restarting) {
          console.error("Stdout forwarding error:", error);
        }
      }
    })();

    // Forward stderr
    (async () => {
      const reader = this.serverProcess!.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await Deno.stderr.write(value);
        }
      } catch (error) {
        if (!this.restarting) {
          console.error("Stderr forwarding error:", error);
        }
      }
    })();
  }

  private sendRequest(method: string, params?: unknown): Promise<Message> {
    const id = this.currentRequestId++;
    const request: Message = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);

      if (this.serverProcess) {
        const writer = this.serverProcess.stdin.getWriter();
        writer.write(new TextEncoder().encode(JSON.stringify(request) + "\n"))
          .then(() => writer.releaseLock())
          .catch((error) => {
            this.pendingRequests.delete(id);
            resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: error.toString() } });
          });
      } else {
        this.pendingRequests.delete(id);
        resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Server not running" } });
      }

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Request timeout" } });
        }
      }, 5000);
    });
  }

  private async getToolsList(): Promise<unknown[]> {
    if (!this.serverProcess) return [];

    try {
      console.error("🔧 Fetching tools list from server...");

      // First ensure server is initialized
      if (this.initializeParams) {
        console.error("📤 Sending initialize request to new server...");
        const initResponse = await this.sendRequest("initialize", this.initializeParams);
        if (initResponse.error) {
          console.error("❌ Failed to initialize server:", initResponse.error);
          console.error("💡 Server may need environment variables. Check your .env file");
          return [];
        }
        console.error("✅ Server initialized successfully");
      } else {
        console.error("⚠️  No initialize params captured from original connection");
      }

      // Get tools list
      console.error("📋 Requesting tools list...");
      const response = await this.sendRequest("tools/list", {});

      if (response.error) {
        console.error("❌ Failed to get tools list:", response.error);
        return [];
      }

      const tools = (response.result as { tools?: unknown[] })?.tools || [];
      console.error(`✅ Found ${tools.length} tools`);

      // Log tool names for debugging
      if (tools.length > 0) {
        const toolNames = tools.map((t: unknown) => (t as { name: string }).name).join(", ");
        console.error(`📦 Tools: ${toolNames}`);
      }

      return tools;
    } catch (error) {
      console.error("❌ Error getting tools list:", error);
      return [];
    }
  }

  readonly restart: DebouncedFunction<[]> = debounce(async () => {
    console.error("\n🔄 File change detected, restarting server...");
    this.restarting = true;

    // Kill the old server completely
    await this.killServer();

    // Wait a moment to ensure process is fully terminated
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start new server
    await this.startServer();

    // Wait for server to be ready (increased from 1s to 2s)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get updated tools list
    const tools = await this.getToolsList();

    // Send tool change notification
    const notification: Message = {
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
      params: {
        tools: tools,
      },
    };

    try {
      await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
      console.error(`📢 Sent tool change notification with ${tools.length} tools`);
    } catch (error) {
      console.error("❌ Failed to send notification:", error);
    }

    this.restarting = false;
    console.error("✅ Server restart complete\n");
  }, restartDelay);

  private async startWatcher() {
    if (!entryFile) return;

    try {
      await Deno.stat(entryFile);
      console.error(`✅ Watching ${entryFile} for changes`);

      const watcher = Deno.watchFs([entryFile]);
      for await (const event of watcher) {
        if (["modify", "remove"].includes(event.kind)) {
          console.error(`📝 File ${event.kind}: ${entryFile}`);
          this.restart();
        }
      }
    } catch (error) {
      console.error(`❌ Failed to watch file: ${error}`);
    }
  }

  async shutdown() {
    console.error("\n🛑 Shutting down proxy...");
    this.restarting = true;
    await this.killServer();
    Deno.exit(0);
  }
}

// Create and start proxy
const proxy = new MCPProxy();

// Handle shutdown signals
Deno.addSignalListener("SIGINT", () => proxy.shutdown());
Deno.addSignalListener("SIGTERM", () => proxy.shutdown());

// Start the proxy
await proxy.start();
