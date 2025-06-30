#!/usr/bin/env -S deno run --allow-all
/**
 * Hot-Reload Proxy Final Version for MCP Servers
 * 
 * This version addresses:
 * 1. Proper process termination - ensures old process is fully killed
 * 2. Connection management - maintains single connection to Claude
 * 3. Stream buffering - buffers messages during restart
 * 4. Tool discovery - sends notifications after successful restart
 * 5. Process verification - confirms old process is gone before starting new
 */

import { debounce } from "https://deno.land/std@0.208.0/async/debounce.ts";

const args = Deno.args;
if (args.length === 0) {
  console.error("Usage: hot-reload-proxy-final.ts <command> [args...]");
  Deno.exit(1);
}

// Parse arguments
let command: string;
let commandArgs: string[] = [];
let entryFile: string | null = null;
let i = 0;

command = args[i++];
while (i < args.length) {
  commandArgs.push(args[i++]);
}

// Determine entry file to watch
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

console.error(`🚀 Starting hot-reload proxy (final version)`);
console.error(`📟 Command: ${command} ${commandArgs.join(" ")}`);
if (entryFile) {
  console.error(`👀 Watching: ${entryFile}`);
} else {
  console.error(`⚠️  No entry file detected for watching`);
}

interface Message {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class MCPProxy {
  private serverProcess: Deno.ChildProcess | null = null;
  private serverPid: number | null = null;
  private stdinBuffer: Uint8Array[] = [];
  private messageBuffer: Message[] = [];
  private restarting = false;
  private stdinReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private currentRequestId = 1;
  private initializeParams: any = null;
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
    
    // Wait for server to exit
    if (this.serverProcess) {
      const status = await this.serverProcess.status;
      console.error(`Server exited with code: ${status.code}`);
      Deno.exit(status.code);
    }
  }
  
  private async startServer() {
    console.error("🚀 Starting MCP server...");
    
    this.serverProcess = new Deno.Command(command, {
      args: commandArgs,
      stdin: "piped",
      stdout: "piped", 
      stderr: "piped",
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
                  console.error(`📦 Buffered message during restart: ${message.method || `response ${message.id}`}`);
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
  
  private async sendRequest(method: string, params?: any): Promise<Message> {
    const id = this.currentRequestId++;
    const request: Message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    
    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      
      if (this.serverProcess) {
        const writer = this.serverProcess.stdin.getWriter();
        writer.write(new TextEncoder().encode(JSON.stringify(request) + "\n"))
          .then(() => writer.releaseLock())
          .catch(error => {
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
  
  private async getToolsList(): Promise<any[]> {
    if (!this.serverProcess) return [];
    
    try {
      console.error("🔧 Fetching tools list from server...");
      
      // First ensure server is initialized
      if (this.initializeParams) {
        const initResponse = await this.sendRequest("initialize", this.initializeParams);
        if (initResponse.error) {
          console.error("❌ Failed to initialize server:", initResponse.error);
          return [];
        }
      }
      
      // Get tools list
      const response = await this.sendRequest("tools/list", {});
      
      if (response.error) {
        console.error("❌ Failed to get tools list:", response.error);
        return [];
      }
      
      const tools = response.result?.tools || [];
      console.error(`✅ Found ${tools.length} tools`);
      return tools;
    } catch (error) {
      console.error("❌ Error getting tools list:", error);
      return [];
    }
  }
  
  restart = debounce(async () => {
    console.error("\n🔄 File change detected, restarting server...");
    this.restarting = true;
    
    // Kill the old server completely
    await this.killServer();
    
    // Wait a moment to ensure process is fully terminated
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start new server
    await this.startServer();
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get updated tools list
    const tools = await this.getToolsList();
    
    // Send tool change notification
    const notification: Message = {
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
      params: {
        tools: tools
      }
    };
    
    try {
      await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
      console.error(`📢 Sent tool change notification with ${tools.length} tools`);
    } catch (error) {
      console.error("❌ Failed to send notification:", error);
    }
    
    this.restarting = false;
    console.error("✅ Server restart complete\n");
  }, 300);
  
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