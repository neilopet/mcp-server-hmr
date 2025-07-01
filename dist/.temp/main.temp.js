#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPProxy = void 0;
const async_ts_1 = require("./std/async.ts");
let command;
let commandArgs = [];
let entryFile = null;
let restartDelay = 300;
if (Deno.args.length > 0) {
    console.error("🧪 Using command line arguments mode");
    let i = 0;
    command = Deno.args[i++];
    while (i < Deno.args.length) {
        commandArgs.push(Deno.args[i++]);
    }
    if (command === "node" && commandArgs.length > 0) {
        entryFile = commandArgs[0];
    }
    else if (command === "deno" && commandArgs.includes("run")) {
        const runIndex = commandArgs.indexOf("run");
        for (let j = runIndex + 1; j < commandArgs.length; j++) {
            if (!commandArgs[j].startsWith("-")) {
                entryFile = commandArgs[j];
                break;
            }
        }
    }
    else if (command === "python" && commandArgs.length > 0) {
        entryFile = commandArgs[0];
    }
}
else {
    console.error("🔧 Using environment variables mode");
    const serverCommand = Deno.env.get("MCP_SERVER_COMMAND");
    const serverArgs = Deno.env.get("MCP_SERVER_ARGS");
    const watchFile = Deno.env.get("MCP_WATCH_FILE");
    restartDelay = parseInt(Deno.env.get("MCP_RESTART_DELAY") || "300");
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
    if (command === "node" && commandArgs.length > 0) {
        entryFile = commandArgs[commandArgs.length - 1];
    }
    else if (command === "deno" && commandArgs.includes("run")) {
        const runIndex = commandArgs.indexOf("run");
        for (let j = runIndex + 1; j < commandArgs.length; j++) {
            if (!commandArgs[j].startsWith("-")) {
                entryFile = commandArgs[j];
                break;
            }
        }
    }
    else if (command === "python" && commandArgs.length > 0) {
        entryFile = commandArgs[commandArgs.length - 1];
    }
}
console.error(`🚀 Starting MCP Server HMR`);
console.error(`📟 Server: ${command} ${commandArgs.join(" ")}`);
if (entryFile) {
    console.error(`👀 Watching: ${entryFile}`);
}
else {
    console.error(`⚠️  No entry file detected - hot-reload disabled`);
}
class MCPProxy {
    constructor() {
        this.serverProcess = null;
        this.serverPid = null;
        this.stdinBuffer = [];
        this.messageBuffer = [];
        this.restarting = false;
        this.stdinReader = null;
        this.currentRequestId = 1;
        this.initializeParams = null;
        this.pendingRequests = new Map();
        this.restart = (0, async_ts_1.debounce)(async () => {
            console.error("\n🔄 File change detected, restarting server...");
            this.restarting = true;
            await this.killServer();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.startServer();
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const tools = await this.getToolsList();
            const notification = {
                jsonrpc: "2.0",
                method: "notifications/tools/list_changed",
                params: {
                    tools: tools,
                },
            };
            try {
                await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
                console.error(`📢 Sent tool change notification with ${tools.length} tools`);
            }
            catch (error) {
                console.error("❌ Failed to send notification:", error);
            }
            this.restarting = false;
            console.error("✅ Server restart complete\n");
        }, restartDelay);
    }
    async start() {
        await this.startServer();
        this.setupStdinForwarding();
        if (entryFile) {
            this.startWatcher();
        }
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
                }
                catch (error) {
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
    async startServer() {
        console.error("🚀 Starting MCP server...");
        this.serverProcess = new Deno.Command(command, {
            args: commandArgs,
            stdin: "piped",
            stdout: "piped",
            stderr: "piped",
            env: Deno.env.toObject(),
        }).spawn();
        this.serverPid = this.serverProcess.pid;
        console.error(`✅ Server started with PID: ${this.serverPid}`);
        this.setupOutputForwarding();
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
    async killServer() {
        if (!this.serverProcess || !this.serverPid)
            return;
        console.error(`🛑 Killing server process ${this.serverPid}...`);
        try {
            this.serverProcess.kill("SIGTERM");
            const timeout = setTimeout(() => {
                console.error("⚠️  Server didn't exit gracefully, sending SIGKILL...");
                this.serverProcess?.kill("SIGKILL");
            }, 5000);
            await this.serverProcess.status;
            clearTimeout(timeout);
            await this.verifyProcessKilled(this.serverPid);
            console.error(`✅ Server process ${this.serverPid} terminated`);
        }
        catch (error) {
            console.error(`❌ Error killing server: ${error}`);
        }
        this.serverProcess = null;
        this.serverPid = null;
    }
    async verifyProcessKilled(pid) {
        try {
            await new Deno.Command("kill", { args: ["-0", pid.toString()] }).output();
            console.error(`⚠️  Process ${pid} still running, forcing kill...`);
            await new Deno.Command("kill", { args: ["-9", pid.toString()] }).output();
        }
        catch {
        }
    }
    setupStdinForwarding() {
        (async () => {
            const reader = Deno.stdin.readable.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const message = JSON.parse(line);
                                if (message.method === "initialize") {
                                    this.initializeParams = message.params;
                                    console.error("📋 Captured initialize params for replay");
                                }
                                if (this.restarting) {
                                    this.messageBuffer.push(message);
                                    console.error(`📦 Buffered message during restart: ${message.method || `response ${message.id}`}`);
                                }
                                else if (this.serverProcess) {
                                    const writer = this.serverProcess.stdin.getWriter();
                                    await writer.write(new TextEncoder().encode(line + "\n"));
                                    writer.releaseLock();
                                }
                            }
                            catch (e) {
                                console.error("Failed to parse message:", e);
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.error("Stdin forwarding error:", error);
            }
        })();
    }
    setupOutputForwarding() {
        if (!this.serverProcess)
            return;
        (async () => {
            const reader = this.serverProcess.stdout.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    const text = decoder.decode(value, { stream: true });
                    await Deno.stdout.write(value);
                    buffer += text;
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const message = JSON.parse(line);
                                if (message.id && this.pendingRequests.has(message.id)) {
                                    const handler = this.pendingRequests.get(message.id);
                                    this.pendingRequests.delete(message.id);
                                    handler(message);
                                }
                            }
                            catch {
                            }
                        }
                    }
                }
            }
            catch (error) {
                if (!this.restarting) {
                    console.error("Stdout forwarding error:", error);
                }
            }
        })();
        (async () => {
            const reader = this.serverProcess.stderr.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    await Deno.stderr.write(value);
                }
            }
            catch (error) {
                if (!this.restarting) {
                    console.error("Stderr forwarding error:", error);
                }
            }
        })();
    }
    sendRequest(method, params) {
        const id = this.currentRequestId++;
        const request = {
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
            }
            else {
                this.pendingRequests.delete(id);
                resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Server not running" } });
            }
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Request timeout" } });
                }
            }, 5000);
        });
    }
    async getToolsList() {
        if (!this.serverProcess)
            return [];
        try {
            console.error("🔧 Fetching tools list from server...");
            if (this.initializeParams) {
                console.error("📤 Sending initialize request to new server...");
                const initResponse = await this.sendRequest("initialize", this.initializeParams);
                if (initResponse.error) {
                    console.error("❌ Failed to initialize server:", initResponse.error);
                    console.error("💡 Server may need environment variables. Check your .env file");
                    return [];
                }
                console.error("✅ Server initialized successfully");
            }
            else {
                console.error("⚠️  No initialize params captured from original connection");
            }
            console.error("📋 Requesting tools list...");
            const response = await this.sendRequest("tools/list", {});
            if (response.error) {
                console.error("❌ Failed to get tools list:", response.error);
                return [];
            }
            const tools = response.result?.tools || [];
            console.error(`✅ Found ${tools.length} tools`);
            if (tools.length > 0) {
                const toolNames = tools.map((t) => t.name).join(", ");
                console.error(`📦 Tools: ${toolNames}`);
            }
            return tools;
        }
        catch (error) {
            console.error("❌ Error getting tools list:", error);
            return [];
        }
    }
    async startWatcher() {
        if (!entryFile)
            return;
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
        }
        catch (error) {
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
exports.MCPProxy = MCPProxy;
const proxy = new MCPProxy();
Deno.addSignalListener("SIGINT", () => proxy.shutdown());
Deno.addSignalListener("SIGTERM", () => proxy.shutdown());
(async () => { await proxy.start(); })().catch(console.error);
