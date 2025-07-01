/**
 * MCP Proxy Class - Hot-reloadable MCP server proxy
 *
 * Provides message buffering, server lifecycle management, and hot-reload capabilities
 * for MCP (Model Context Protocol) servers. Uses dependency injection for cross-platform
 * compatibility between Deno and Node.js environments.
 */
function debounce(fn, delay) {
    let timeoutId;
    let latestArgs;
    const debouncedFn = ((...args) => {
        latestArgs = args;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = undefined;
            fn(...latestArgs);
        }, delay);
    });
    debouncedFn.clear = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };
    debouncedFn.flush = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            fn(...latestArgs);
        }
    };
    return debouncedFn;
}
/**
 * MCPProxy - A hot-reloadable proxy for MCP servers
 *
 * Features:
 * - Message buffering during server restarts
 * - Initialize parameter capture and replay
 * - File watching for hot-reload
 * - Graceful server lifecycle management
 * - Cross-platform via dependency injection
 */
export class MCPProxy {
    managedProcess = null;
    serverPid = null;
    stdinBuffer = [];
    messageBuffer = [];
    restarting = false;
    stdinReader = null;
    currentRequestId = 1;
    initializeParams = null;
    pendingRequests = new Map();
    stdinForwardingStarted = false;
    // Dependency injection
    procManager;
    fs;
    config;
    stdin;
    stdout;
    stderr;
    exit;
    constructor(dependencies, config) {
        this.procManager = dependencies.procManager;
        this.fs = dependencies.fs;
        this.stdin = dependencies.stdin;
        this.stdout = dependencies.stdout;
        this.stderr = dependencies.stderr;
        this.exit = dependencies.exit;
        this.config = config;
        // Initialize restart function with config
        this.restart = debounce(async () => {
            console.error("\n🔄 File change detected, restarting server...");
            this.restarting = true;
            // Kill the old server completely
            await this.killServer();
            // Wait a moment to ensure process is fully terminated
            await new Promise((resolve) => setTimeout(resolve, this.config.killDelay || 1000));
            // Start new server
            try {
                await this.startServer();
            }
            catch (error) {
                console.error(`❌ Failed to start server during restart: ${error}`);
                this.restarting = false;
                return; // Exit restart function if we can't start server
            }
            // Wait for server to be ready
            await new Promise((resolve) => setTimeout(resolve, this.config.readyDelay || 2000));
            // Get updated tools list
            const tools = await this.getToolsList();
            // Send tool change notification
            const notification = {
                jsonrpc: "2.0",
                method: "notifications/tools/list_changed",
                params: {
                    tools: tools,
                },
            };
            try {
                const writer = this.stdout.getWriter();
                await writer.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
                writer.releaseLock();
                console.error(`📢 Sent tool change notification with ${tools.length} tools`);
            }
            catch (error) {
                console.error("❌ Failed to send notification:", error);
            }
            this.restarting = false;
            console.error("✅ Server restart complete\n");
        }, this.config.restartDelay);
    }
    async start() {
        // Start initial server
        try {
            await this.startServer();
        }
        catch (error) {
            console.error(`❌ Failed to start initial server: ${error}`);
            // Continue with setup even if initial server fails
            // Watcher can trigger restart later
        }
        // Setup continuous stdin forwarding
        this.setupStdinForwarding();
        // Start file watcher if we have an entry file
        if (this.config.entryFile) {
            this.startWatcher();
        }
        // Keep proxy running - don't exit when server exits during hot-reload
        // The proxy manages the server lifecycle, not the other way around
        while (true) {
            if (this.managedProcess && !this.restarting) {
                try {
                    const status = await this.managedProcess.status;
                    if (!this.restarting) {
                        console.error(`⚠️  Server exited unexpectedly with code: ${status.code}`);
                        console.error(`🔄 Restarting server...`);
                        try {
                            await this.startServer();
                        }
                        catch (error) {
                            console.error(`❌ Failed to restart server: ${error}`);
                        }
                    }
                }
                catch (error) {
                    if (!this.restarting) {
                        console.error(`❌ Server process error: ${error}`);
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        try {
                            await this.startServer();
                        }
                        catch (startError) {
                            console.error(`❌ Failed to restart server after error: ${startError}`);
                        }
                    }
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    async startServer() {
        console.error("🚀 Starting MCP server...");
        try {
            this.managedProcess = this.procManager.spawn(this.config.command, this.config.commandArgs, {
                env: this.config.env || {}, // Use config env or empty object
            });
            this.serverPid = this.managedProcess.pid || null;
            console.error(`✅ Server started with PID: ${this.serverPid}`);
        }
        catch (error) {
            console.error(`❌ Failed to spawn server process: ${error}`);
            this.managedProcess = null;
            this.serverPid = null;
            throw error; // Re-throw so caller can handle
        }
        // Setup output forwarding
        this.setupOutputForwarding();
        // Replay buffered messages
        if (this.messageBuffer.length > 0) {
            console.error(`📨 Replaying ${this.messageBuffer.length} buffered messages...`);
            const writer = this.managedProcess.stdin.getWriter();
            for (const msg of this.messageBuffer) {
                const data = new TextEncoder().encode(JSON.stringify(msg) + "\n");
                await writer.write(data);
            }
            writer.releaseLock();
            this.messageBuffer = [];
        }
    }
    async killServer() {
        if (!this.managedProcess || !this.serverPid)
            return;
        console.error(`🛑 Killing server process ${this.serverPid}...`);
        try {
            // First try SIGTERM
            this.managedProcess.kill("SIGTERM");
            // Wait up to 5 seconds for graceful shutdown
            const timeout = setTimeout(() => {
                console.error("⚠️  Server didn't exit gracefully, sending SIGKILL...");
                this.managedProcess?.kill("SIGKILL");
            }, 5000);
            await this.managedProcess.status;
            clearTimeout(timeout);
            // Verify process is actually dead
            await this.verifyProcessKilled(this.serverPid);
            console.error(`✅ Server process ${this.serverPid} terminated`);
        }
        catch (error) {
            console.error(`❌ Error killing server: ${error}`);
        }
        this.managedProcess = null;
        this.serverPid = null;
    }
    async verifyProcessKilled(pid) {
        // Try to check if process still exists
        try {
            // On Unix systems, sending signal 0 checks if process exists
            process.kill(pid, 0);
            // If we get here, process still exists
            console.error(`⚠️  Process ${pid} still running, forcing kill...`);
            process.kill(pid, 'SIGKILL');
        }
        catch {
            // Process doesn't exist, which is what we want
        }
    }
    setupStdinForwarding() {
        if (this.stdinForwardingStarted) {
            return; // Already started, don't start again
        }
        this.stdinForwardingStarted = true;
        (async () => {
            const reader = this.stdin.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    // Parse complete JSON-RPC messages
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const message = JSON.parse(line);
                                // Capture initialize params for replay
                                if (message.method === "initialize") {
                                    this.initializeParams = message.params;
                                    console.error("📋 Captured initialize params for replay");
                                }
                                // During restart, buffer all messages
                                if (this.restarting) {
                                    this.messageBuffer.push(message);
                                    console.error(`📦 Buffered message during restart: ${message.method || `response ${message.id}`}`);
                                }
                                else if (this.managedProcess) {
                                    // Forward to server
                                    const writer = this.managedProcess.stdin.getWriter();
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
        if (!this.managedProcess)
            return;
        // Forward stdout
        (async () => {
            const reader = this.managedProcess.stdout.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    // During restart, we still forward output to maintain connection
                    const text = decoder.decode(value, { stream: true });
                    const writer = this.stdout.getWriter();
                    await writer.write(value);
                    writer.releaseLock();
                    // Also parse messages to handle responses
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
                                // Not JSON, ignore
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
        // Forward stderr
        (async () => {
            const reader = this.managedProcess.stderr.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    const writer = this.stderr.getWriter();
                    await writer.write(value);
                    writer.releaseLock();
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
            if (this.managedProcess) {
                const writer = this.managedProcess.stdin.getWriter();
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
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Request timeout" } });
                }
            }, 5000);
        });
    }
    async getToolsList() {
        if (!this.managedProcess)
            return [];
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
            }
            else {
                console.error("⚠️  No initialize params captured from original connection");
            }
            // Get tools list
            console.error("📋 Requesting tools list...");
            const response = await this.sendRequest("tools/list", {});
            if (response.error) {
                console.error("❌ Failed to get tools list:", response.error);
                return [];
            }
            const tools = response.result?.tools || [];
            console.error(`✅ Found ${tools.length} tools`);
            // Log tool names for debugging
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
    restart;
    async startWatcher() {
        if (!this.config.entryFile)
            return;
        try {
            // Verify file exists by attempting to read it
            await this.fs.readFile(this.config.entryFile);
            console.error(`✅ Watching ${this.config.entryFile} for changes`);
            const watcher = this.fs.watch([this.config.entryFile]);
            for await (const event of watcher) {
                if (["modify", "remove"].includes(event.type)) {
                    console.error(`📝 File ${event.type}: ${event.path}`);
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
        // Note: Process exit is handled by the caller (main.ts or test runner)
    }
}
