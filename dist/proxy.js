/**
 * MCP Proxy Class - Hot-reloadable MCP server proxy
 *
 * Provides message buffering, server lifecycle management, and hot-reload capabilities
 * for MCP (Model Context Protocol) servers. Uses dependency injection for cross-platform
 * compatibility between Deno and Node.js environments.
 */
import { randomUUID } from 'crypto';
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
        timeoutId.unref();
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
    containerId = null;
    stdinBuffer = [];
    messageBuffer = [];
    restarting = false;
    stdinReader = null;
    currentRequestId = 1;
    initializeParams = null;
    pendingRequests = new Map();
    stdinForwardingStarted = false;
    killTimeout;
    fileWatcher;
    shutdownRequested = false;
    startPromise;
    monitoringTimeout;
    errorRetryTimeout;
    pendingToolsListRequests = new Map(); // Track tools/list requests that need injection
    sessionId = randomUUID();
    // Dependency injection
    procManager;
    changeSource;
    config;
    stdin;
    stdout;
    stderr;
    exit;
    extensionRegistry;
    extensionHooks = {};
    constructor(dependencies, config) {
        this.procManager = dependencies.procManager;
        // Support both new ChangeSource and legacy FileSystem interfaces
        if (dependencies.changeSource) {
            this.changeSource = dependencies.changeSource;
        }
        else if (dependencies.fs) {
            // Create adapter from FileSystem to ChangeSource
            this.changeSource = this.createFileSystemAdapter(dependencies.fs);
        }
        else {
            throw new Error("Either changeSource or fs must be provided in ProxyDependencies");
        }
        this.stdin = dependencies.stdin;
        this.stdout = dependencies.stdout;
        this.stderr = dependencies.stderr;
        this.exit = dependencies.exit;
        this.config = this.normalizeConfig(config);
        this.extensionRegistry = dependencies.extensionRegistry;
        // Initialize restart function with config
        this.restart = debounce(async () => {
            console.error("\n🔄 File change detected, restarting server...");
            this.restarting = true;
            // Kill the old server completely
            await this.killServer();
            // Wait a moment to ensure process is fully terminated
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, this.config.killDelay || 1000);
                timeout.unref();
            });
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
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, this.config.readyDelay || 2000);
                timeout.unref();
            });
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
    /**
     * Auto-detect files to watch from command and arguments
     * Used as fallback when no explicit watchTargets are provided
     */
    autoDetectWatchTargets(command, commandArgs) {
        const watchTargets = [];
        // Look for the first file argument that looks like a script
        for (const arg of commandArgs) {
            // Skip flags
            if (arg.startsWith("-"))
                continue;
            // Check for common script extensions
            const scriptExtensions = [".js", ".mjs", ".ts", ".py", ".rb", ".php"];
            const hasScriptExtension = scriptExtensions.some(ext => arg.endsWith(ext));
            if (hasScriptExtension) {
                watchTargets.push(arg);
                break; // Only auto-detect the first script file for now
            }
        }
        return watchTargets;
    }
    /**
     * Normalize config to handle backward compatibility between entryFile and watchTargets
     */
    normalizeConfig(config) {
        const normalized = { ...config };
        // Handle backward compatibility: entryFile -> watchTargets
        if (!normalized.watchTargets && normalized.entryFile) {
            normalized.watchTargets = [normalized.entryFile];
        }
        // Auto-detect files to watch if no explicit targets provided
        // This supports library usage where users create MCPProxy directly
        if (!normalized.watchTargets || normalized.watchTargets.length === 0) {
            const autoDetected = this.autoDetectWatchTargets(normalized.command, normalized.commandArgs);
            normalized.watchTargets = autoDetected;
        }
        // Ensure we have an array (can be empty for non-file-based monitoring)
        if (!normalized.watchTargets) {
            normalized.watchTargets = [];
        }
        return normalized;
    }
    /**
     * Create an adapter that converts FileSystem to ChangeSource interface
     */
    createFileSystemAdapter(fs) {
        return {
            async *watch(paths) {
                for await (const fileEvent of fs.watch(paths)) {
                    // Convert FileEvent to ChangeEvent
                    const changeEvent = {
                        type: fileEvent.type,
                        path: fileEvent.path,
                    };
                    yield changeEvent;
                }
            },
            readFile: fs.readFile.bind(fs),
            writeFile: fs.writeFile.bind(fs),
            exists: fs.exists.bind(fs),
            copyFile: fs.copyFile.bind(fs),
        };
    }
    /**
     * Check if the proxy and server are currently running
     */
    isRunning() {
        return this.managedProcess !== null && this.serverPid !== null && !this.restarting;
    }
    /**
     * Initialize extensions with context
     */
    async initializeExtensions() {
        if (!this.extensionRegistry)
            return;
        try {
            console.error("🔌 Initializing extensions...");
            // Create extension context
            const context = {
                sessionId: `mcpmon-${Date.now()}`,
                dataDir: this.config.dataDir || `${process.cwd()}/mcpmon-data`,
                logger: {
                    info: (message) => console.error(`[Extension] ℹ️  ${message}`),
                    debug: (message) => console.error(`[Extension] 🐛 ${message}`),
                    error: (message) => console.error(`[Extension] ❌ ${message}`),
                    warn: (message) => console.error(`[Extension] ⚠️  ${message}`)
                },
                hooks: this.extensionHooks,
                dependencies: {
                    procManager: this.procManager,
                    changeSource: this.changeSource,
                    stdin: this.stdin,
                    stdout: this.stdout,
                    stderr: this.stderr,
                    exit: this.exit
                }
            };
            // Initialize all enabled extensions
            await this.extensionRegistry.initializeAll(context);
            // Log which hooks were registered
            console.error("✅ Extensions initialized");
            console.error("📋 Registered extension hooks:");
            if (this.extensionHooks.getAdditionalTools)
                console.error("  - getAdditionalTools ✓");
            if (this.extensionHooks.handleToolCall)
                console.error("  - handleToolCall ✓");
            if (this.extensionHooks.beforeStdinForward)
                console.error("  - beforeStdinForward ✓");
            if (this.extensionHooks.afterStdoutReceive)
                console.error("  - afterStdoutReceive ✓");
        }
        catch (error) {
            console.error(`❌ Failed to initialize extensions: ${error}`);
            // Continue without extensions rather than failing completely
        }
    }
    async start() {
        // Initialize extensions if registry is available
        if (this.extensionRegistry) {
            await this.initializeExtensions();
        }
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
        // Start watcher if we have targets to monitor
        if (this.config.watchTargets && this.config.watchTargets.length > 0) {
            this.startWatcher();
        }
        // Keep proxy running - don't exit when server exits during hot-reload
        // The proxy manages the server lifecycle, not the other way around
        while (!this.shutdownRequested) {
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
                        await new Promise((resolve) => {
                            this.errorRetryTimeout = setTimeout(resolve, 1000);
                            this.errorRetryTimeout.unref();
                        });
                        try {
                            await this.startServer();
                        }
                        catch (startError) {
                            console.error(`❌ Failed to restart server after error: ${startError}`);
                        }
                    }
                }
            }
            if (!this.shutdownRequested) {
                await new Promise((resolve) => {
                    this.monitoringTimeout = setTimeout(resolve, 100);
                    this.monitoringTimeout.unref();
                });
            }
        }
    }
    async startServer() {
        console.error("🚀 Starting MCP server...");
        try {
            // Check if this is a Docker run command and inject labels + detached mode
            let commandArgs = [...this.config.commandArgs];
            let isDockerRun = false;
            if (this.config.command === 'docker' && commandArgs.includes('run')) {
                isDockerRun = true;
                const runIndex = commandArgs.indexOf('run');
                if (runIndex !== -1) {
                    // Insert labels after 'run' but before other flags (NO -d flag to preserve stdio)
                    const dockerFlags = [
                        '--label', 'mcpmon.managed=true',
                        '--label', `mcpmon.session=${this.sessionId}`,
                        '--label', `mcpmon.pid=${process.pid}`,
                        '--label', `mcpmon.started=${Date.now()}`
                    ];
                    // Insert Docker flags at the correct position (after 'run')
                    commandArgs.splice(runIndex + 1, 0, ...dockerFlags);
                    console.error(`🐳 Injecting Docker labels for session ${this.sessionId}`);
                }
            }
            this.managedProcess = this.procManager.spawn(this.config.command, commandArgs, {
                env: this.config.env || {}, // Use config env or empty object
            });
            this.serverPid = this.managedProcess.pid || null;
            // For Docker containers, query container ID after startup (preserves stdio)
            if (isDockerRun) {
                try {
                    // Wait a moment for container to start, then query docker ps
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    // Query for the latest container with our session label
                    const queryProcess = this.procManager.spawn('docker', [
                        'ps', '-q', '--latest',
                        '--filter', `label=mcpmon.session=${this.sessionId}`
                    ], {});
                    const reader = queryProcess.stdout.getReader();
                    const decoder = new TextDecoder();
                    let containerIdOutput = '';
                    // Read container ID from query
                    const { value } = await reader.read();
                    if (value) {
                        containerIdOutput = decoder.decode(value);
                        this.containerId = containerIdOutput.trim();
                        if (this.containerId) {
                            console.error(`📦 Captured Docker container ID: ${this.containerId}`);
                        }
                        else {
                            console.error(`⚠️  No container ID found for session ${this.sessionId}`);
                        }
                    }
                    reader.releaseLock();
                    await queryProcess.status;
                }
                catch (error) {
                    console.error(`⚠️  Failed to query container ID: ${error}`);
                    // Continue without container ID - not fatal
                }
            }
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
            // Check if this is a Docker process
            const isDocker = this.config.command === 'docker' &&
                this.config.commandArgs[0] === 'run';
            if (isDocker) {
                // For Docker, we need to stop the container, not just the docker run process
                await this.stopDockerContainer();
            }
            // First try SIGTERM
            this.managedProcess.kill("SIGTERM");
            // Wait up to 5 seconds for graceful shutdown
            this.killTimeout = setTimeout(() => {
                console.error("⚠️  Server didn't exit gracefully, sending SIGKILL...");
                this.managedProcess?.kill("SIGKILL");
            }, 5000);
            this.killTimeout.unref();
            await this.managedProcess.status;
            clearTimeout(this.killTimeout);
            this.killTimeout = undefined;
            // Verify process is actually dead
            await this.verifyProcessKilled(this.serverPid);
            console.error(`✅ Server process ${this.serverPid} terminated`);
        }
        catch (error) {
            console.error(`❌ Error killing server: ${error}`);
        }
        this.managedProcess = null;
        this.serverPid = null;
        this.containerId = null;
    }
    async stopDockerContainer() {
        // Check if we have a tracked container ID (will be set by DOCKERFIX-1)
        if (!this.containerId) {
            console.error("⚠️  No container ID tracked for this mcpmon instance, skipping container stop");
            return;
        }
        const containerId = this.containerId; // Save for consistent logging
        console.error(`🐳 Stopping Docker container ${containerId}...`);
        try {
            // First try graceful stop with 10-second timeout
            console.error(`⏱️  Attempting graceful stop with 10s timeout for container ${containerId}`);
            const stopProcess = this.procManager.spawn('docker', [
                'stop', '-t', '10', containerId
            ], {});
            await stopProcess.status;
            console.error(`✅ Successfully stopped Docker container ${containerId}`);
            // Clear the container ID after successful stop
            this.containerId = null;
        }
        catch (stopError) {
            console.error(`⚠️  Graceful stop failed for container ${containerId}: ${stopError}`);
            // Fallback to force kill if stop fails
            try {
                console.error(`🔪 Force killing container ${containerId}...`);
                const killProcess = this.procManager.spawn('docker', [
                    'kill', containerId
                ], {});
                await killProcess.status;
                console.error(`✅ Force killed Docker container ${containerId}`);
                // Clear the container ID after force kill
                this.containerId = null;
            }
            catch (killError) {
                console.error(`❌ Failed to kill container ${containerId}: ${killError}`);
                console.error("⚠️  Container may still be running - manual cleanup may be required");
                // Still clear the container ID to avoid trying to stop it again
                this.containerId = null;
            }
        }
    }
    async verifyProcessKilled(pid) {
        // Try to check if process still exists
        try {
            // On Unix systems, sending signal 0 checks if process exists
            process.kill(pid, 0);
            // If we get here, process still exists
            console.error(`⚠️  Process ${pid} still running, forcing kill...`);
            process.kill(pid, "SIGKILL");
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
                                let message = JSON.parse(line);
                                // Apply beforeStdinForward hook if available
                                if (this.extensionHooks.beforeStdinForward) {
                                    try {
                                        message = await this.extensionHooks.beforeStdinForward(message);
                                    }
                                    catch (hookError) {
                                        console.error("Extension hook error (beforeStdinForward):", hookError);
                                        // Continue with original message if hook fails
                                    }
                                }
                                // Capture initialize params for replay
                                if (message.method === "initialize") {
                                    this.initializeParams = message.params;
                                    console.error("📋 Captured initialize params for replay");
                                }
                                // Check if this is a tools/list request that needs extension tools injected
                                if (message.method === "tools/list") {
                                    console.error("🔧 Intercepting tools/list request from client");
                                    // Forward to server first to get base tools
                                    if (this.managedProcess) {
                                        const writer = this.managedProcess.stdin.getWriter();
                                        await writer.write(new TextEncoder().encode(JSON.stringify(message) + "\n"));
                                        writer.releaseLock();
                                        // Store that we need to inject tools into this response
                                        if (message.id) {
                                            this.pendingToolsListRequests.set(message.id, true);
                                            console.error(`📝 Marked request ${message.id} for tool injection`);
                                        }
                                    }
                                    continue; // Skip normal forwarding since we already forwarded
                                }
                                // Check if this is a tool call that should be handled by extensions
                                if (message.method === "tools/call" && this.extensionHooks.handleToolCall) {
                                    const toolName = message.params?.name;
                                    console.error(`🔨 Received tools/call request for: ${toolName}`);
                                    if (toolName && toolName.startsWith("mcpmon_")) {
                                        console.error(`🔌 Extension tool call detected: ${toolName}`);
                                        try {
                                            const result = await this.extensionHooks.handleToolCall(toolName, message.params?.arguments || {});
                                            if (result !== null) {
                                                console.error(`✅ Extension handled tool call: ${toolName}`);
                                                // Send response directly back to client
                                                const response = {
                                                    jsonrpc: "2.0",
                                                    id: message.id,
                                                    result
                                                };
                                                const writer = this.stdout.getWriter();
                                                await writer.write(new TextEncoder().encode(JSON.stringify(response) + "\n"));
                                                writer.releaseLock();
                                                continue; // Don't forward to server
                                            }
                                        }
                                        catch (error) {
                                            console.error(`❌ Extension tool error for ${toolName}: ${error}`);
                                            // Send error response
                                            const errorResponse = {
                                                jsonrpc: "2.0",
                                                id: message.id,
                                                error: {
                                                    code: -32603,
                                                    message: `Extension tool error: ${error}`,
                                                    data: { toolName }
                                                }
                                            };
                                            const writer = this.stdout.getWriter();
                                            await writer.write(new TextEncoder().encode(JSON.stringify(errorResponse) + "\n"));
                                            writer.releaseLock();
                                            continue; // Don't forward to server
                                        }
                                    }
                                }
                                // During restart, buffer all messages
                                if (this.restarting) {
                                    this.messageBuffer.push(message);
                                    console.error(`📦 Buffered message during restart: ${message.method || `response ${message.id}`}`);
                                }
                                else if (this.managedProcess) {
                                    // Forward to server
                                    const writer = this.managedProcess.stdin.getWriter();
                                    await writer.write(new TextEncoder().encode(JSON.stringify(message) + "\n"));
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
                    // Parse messages first to allow hook modifications
                    const text = decoder.decode(value, { stream: true });
                    buffer += text;
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                let message = JSON.parse(line);
                                let modifiedMessage = message;
                                // Check if this is a tools/list response that needs extension tools injected
                                if (message.id && this.pendingToolsListRequests.has(message.id)) {
                                    console.error(`🔧 Processing tools/list response for request ${message.id}`);
                                    this.pendingToolsListRequests.delete(message.id);
                                    // Get extension tools
                                    if (this.extensionHooks.getAdditionalTools && message.result) {
                                        try {
                                            const extensionTools = await this.extensionHooks.getAdditionalTools();
                                            console.error(`🔌 Extension provided ${extensionTools.length} tools`);
                                            // Log tool details for debugging
                                            extensionTools.forEach(tool => {
                                                console.error(`  - ${tool.name}: ${tool.description}`);
                                                // Validate tool schema
                                                if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
                                                    console.error(`  ⚠️  Tool ${tool.name} has invalid inputSchema`);
                                                }
                                            });
                                            // Merge extension tools with server tools
                                            const serverTools = message.result?.tools || [];
                                            const mergedTools = [...serverTools, ...extensionTools];
                                            modifiedMessage = {
                                                ...message,
                                                result: {
                                                    ...message.result,
                                                    tools: mergedTools
                                                }
                                            };
                                            console.error(`✅ Injected ${extensionTools.length} extension tools into response (total: ${mergedTools.length})`);
                                            // Log the final JSON for debugging (truncated)
                                            const responseText = JSON.stringify(modifiedMessage);
                                            if (responseText.length > 500) {
                                                console.error(`📤 Response (truncated): ${responseText.substring(0, 500)}...`);
                                            }
                                            else {
                                                console.error(`📤 Response: ${responseText}`);
                                            }
                                        }
                                        catch (error) {
                                            console.error(`❌ Failed to inject extension tools: ${error}`);
                                        }
                                    }
                                }
                                // Apply afterStdoutReceive hook if available
                                if (this.extensionHooks.afterStdoutReceive) {
                                    try {
                                        modifiedMessage = await this.extensionHooks.afterStdoutReceive(modifiedMessage);
                                    }
                                    catch (hookError) {
                                        console.error("Extension hook error (afterStdoutReceive):", hookError);
                                        // Continue with original message if hook fails
                                        modifiedMessage = message;
                                    }
                                }
                                // Forward the modified message to stdout
                                const writer = this.stdout.getWriter();
                                const modifiedText = JSON.stringify(modifiedMessage) + "\n";
                                await writer.write(new TextEncoder().encode(modifiedText));
                                writer.releaseLock();
                                // Handle pending requests
                                if (modifiedMessage.id && this.pendingRequests.has(modifiedMessage.id)) {
                                    const pending = this.pendingRequests.get(modifiedMessage.id);
                                    clearTimeout(pending.timeoutId);
                                    this.pendingRequests.delete(modifiedMessage.id);
                                    pending.resolve(modifiedMessage);
                                }
                            }
                            catch {
                                // Not JSON, forward as-is
                                const writer = this.stdout.getWriter();
                                await writer.write(new TextEncoder().encode(line + "\n"));
                                writer.releaseLock();
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
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Request timeout" } });
                }
            }, 5000);
            timeoutId.unref();
            this.pendingRequests.set(id, { resolve, reject, timeoutId });
            if (this.managedProcess) {
                const writer = this.managedProcess.stdin.getWriter();
                writer
                    .write(new TextEncoder().encode(JSON.stringify(request) + "\n"))
                    .then(() => writer.releaseLock())
                    .catch((error) => {
                    const pending = this.pendingRequests.get(id);
                    if (pending) {
                        clearTimeout(pending.timeoutId);
                        this.pendingRequests.delete(id);
                        resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: error.toString() } });
                    }
                });
            }
            else {
                const pending = this.pendingRequests.get(id);
                if (pending) {
                    clearTimeout(pending.timeoutId);
                    this.pendingRequests.delete(id);
                    resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Server not running" } });
                }
            }
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
            let tools = response.result?.tools || [];
            // Add extension tools if available
            if (this.extensionHooks.getAdditionalTools) {
                try {
                    const additionalTools = await this.extensionHooks.getAdditionalTools();
                    tools = [...tools, ...additionalTools];
                    console.error(`🔌 Added ${additionalTools.length} extension tools`);
                }
                catch (error) {
                    console.error(`❌ Error getting extension tools: ${error}`);
                }
            }
            console.error(`✅ Found ${tools.length} tools total`);
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
        if (!this.config.watchTargets || this.config.watchTargets.length === 0)
            return;
        try {
            // For file-based targets, verify they exist by attempting to read them
            for (const target of this.config.watchTargets) {
                try {
                    await this.changeSource.readFile(target);
                }
                catch (error) {
                    // Log warning but continue - some targets might not be files (e.g., packages)
                    console.error(`⚠️  Could not verify target: ${target} (${error})`);
                }
            }
            const targets = this.config.watchTargets.join(", ");
            console.error(`✅ Watching ${targets} for changes`);
            this.fileWatcher = this.changeSource.watch(this.config.watchTargets);
            for await (const event of this.fileWatcher) {
                // Check if shutdown was requested
                if (this.shutdownRequested) {
                    break;
                }
                // Handle both old FileEvent types and new ChangeEvent types
                if (["modify", "remove", "version_update", "dependency_change"].includes(event.type)) {
                    console.error(`📝 ${event.type}: ${event.path}`);
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
        this.shutdownRequested = true;
        // Clear any pending restart
        this.restart.clear();
        // Shutdown extensions
        if (this.extensionRegistry) {
            try {
                await this.extensionRegistry.shutdownAll();
            }
            catch (error) {
                console.error("❌ Error shutting down extensions:", error);
            }
        }
        // Clear monitoring timeouts
        if (this.monitoringTimeout) {
            clearTimeout(this.monitoringTimeout);
            this.monitoringTimeout = undefined;
        }
        if (this.errorRetryTimeout) {
            clearTimeout(this.errorRetryTimeout);
            this.errorRetryTimeout = undefined;
        }
        // Clear all pending request timeouts
        for (const [id, request] of this.pendingRequests) {
            if (request.timeoutId) {
                clearTimeout(request.timeoutId);
            }
            request.reject(new Error("Proxy shutting down"));
        }
        this.pendingRequests.clear();
        // Clear kill timeout if exists
        if (this.killTimeout) {
            clearTimeout(this.killTimeout);
            this.killTimeout = undefined;
        }
        // Kill the server
        await this.killServer();
        // Note: Process exit is handled by the caller (main.ts or test runner)
    }
}
