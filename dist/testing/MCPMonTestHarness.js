/**
 * MCPMonTestHarness - Integration test harness for real mcpmon proxy
 *
 * Provides controlled testing environment for integration tests with real MCPProxy
 * infrastructure while maintaining isolation and deterministic behavior.
 */
import { MCPProxy } from '../proxy.js';
import { createMockMCPServer } from './MockMCPServer.js';
// Create simple mock implementations for testing
class MockProcessManager {
    spawnCount = 0;
    spawnShouldFail = false;
    spawnedProcesses = [];
    mockServer = null;
    getSpawnCallCount() {
        return this.spawnCount;
    }
    setSpawnShouldFail(shouldFail) {
        this.spawnShouldFail = shouldFail;
    }
    getAllSpawnedProcesses() {
        return [...this.spawnedProcesses];
    }
    setMockServer(server) {
        this.mockServer = server;
    }
    getMockServer() {
        return this.mockServer;
    }
    spawn(command, args, options) {
        this.spawnCount++;
        if (this.spawnShouldFail) {
            throw new Error('Spawn failed');
        }
        const processState = {
            exited: false,
            exitCode: null
        };
        let stdin;
        let stdout;
        let stderr;
        // If mock server is available, create connected streams
        if (this.mockServer) {
            // Create paired streams for bidirectional communication
            const { readable: proxyToServerReadable, writable: proxyToServerWritable } = new TransformStream();
            const { readable: serverToProxyReadable, writable: serverToProxyWritable } = new TransformStream();
            // Connect mock server
            this.mockServer.connect(proxyToServerReadable, serverToProxyWritable);
            // Process streams from proxy perspective:
            stdin = proxyToServerWritable; // Proxy writes to server
            stdout = serverToProxyReadable; // Proxy reads from server
            stderr = new ReadableStream(); // Empty stderr stream
        }
        else {
            // Default empty streams for non-mock scenarios
            stdin = new WritableStream();
            stdout = new ReadableStream();
            stderr = new ReadableStream();
        }
        const process = {
            pid: 1000 + this.spawnCount,
            stdin,
            stdout,
            stderr,
            status: Promise.resolve({ success: true, code: 0 }),
            kill: () => {
                if (this.mockServer) {
                    this.mockServer.disconnect();
                }
            },
            hasExited: () => processState.exited,
            simulateExit: (code) => {
                processState.exited = true;
                processState.exitCode = code;
                if (this.mockServer) {
                    this.mockServer.disconnect();
                }
            }
        };
        this.spawnedProcesses.push(process);
        return process;
    }
}
class MockFileSystem {
    fileExists = new Map();
    fileContent = new Map();
    watchers = [];
    setFileExists(path, exists) {
        this.fileExists.set(path, exists);
    }
    setFileContent(path, content) {
        this.fileContent.set(path, content);
    }
    triggerFileEvent(path, eventType) {
        // Trigger events on active watchers
    }
    closeAllWatchers() {
        this.watchers = [];
    }
    async *watch(paths) {
        // Mock file watching
    }
    async readFile(path) {
        if (!this.fileExists.get(path)) {
            throw new Error(`File not found: ${path}`);
        }
        return this.fileContent.get(path) || '';
    }
    async writeFile(path, content) {
        this.fileContent.set(path, content);
        this.fileExists.set(path, true);
    }
    async exists(path) {
        return this.fileExists.get(path) || false;
    }
    async copyFile(src, dest) {
        const content = await this.readFile(src);
        await this.writeFile(dest, content);
    }
}
/**
 * Real MCPMon proxy test harness for integration testing
 */
export class MCPMonTestHarness {
    proxy = null;
    procManager;
    fs;
    stdin;
    stdout;
    stderr;
    extensionRegistry = null;
    mockServer = null;
    config;
    requestIdCounter = 1;
    pendingRequests = new Map();
    notificationWaiters = [];
    progressTokens = new Set();
    capturedNotifications = [];
    shuttingDown = false;
    outputMonitoringActive = false;
    extensionContexts = new Map();
    constructor() {
        this.procManager = new MockProcessManager();
        this.fs = new MockFileSystem();
        // Create I/O streams
        const stdinTransform = new TransformStream();
        const stdoutTransform = new TransformStream();
        const stderrTransform = new TransformStream();
        this.stdin = {
            readable: stdinTransform.readable,
            writer: stdinTransform.writable.getWriter()
        };
        this.stdout = {
            writable: stdoutTransform.writable,
            reader: stdoutTransform.readable.getReader()
        };
        this.stderr = {
            writable: stderrTransform.writable,
            reader: stderrTransform.readable.getReader()
        };
        // Default config for testing
        this.config = {
            command: 'node',
            commandArgs: ['/test/mock-server.js'],
            watchTargets: ['/test/mock-server.js'],
            restartDelay: 50,
            killDelay: 50,
            readyDelay: 50,
            dataDir: '/tmp/mcpmon-test-harness'
        };
        // Set up mock file system
        this.fs.setFileExists('/test/mock-server.js', true);
    }
    /**
     * Initialize harness with extensions
     */
    async initialize(extensions) {
        if (this.proxy) {
            throw new Error('TestHarness already initialized');
        }
        // Create extension registry if we have extensions
        if (extensions.length > 0) {
            this.extensionRegistry = this.createMockExtensionRegistry(extensions);
            // Create and configure mock server for integration tests
            this.mockServer = createMockMCPServer();
            this.procManager.setMockServer(this.mockServer);
        }
        // Create dependencies  
        const dependencies = {
            procManager: this.procManager,
            fs: this.fs,
            stdin: this.stdin.readable,
            stdout: this.stdout.writable,
            stderr: this.stderr.writable,
            exit: () => { },
            extensionRegistry: this.extensionRegistry || undefined
        };
        // Mock server will be automatically enabled when available in MockProcessManager
        // Create proxy
        this.proxy = new MCPProxy(dependencies, this.config);
        // Start output monitoring
        this.startOutputMonitoring();
        // Start the proxy (don't await - it runs continuously)
        this.proxy.start().catch(error => {
            if (!this.shuttingDown) {
                console.error('Proxy start error:', error);
            }
        });
        // Wait for proxy to be ready
        await this.waitForProxyReady();
    }
    /**
     * Enable specific extension
     */
    async enableExtension(extensionId) {
        if (!this.extensionRegistry) {
            throw new Error('No extension registry available');
        }
        this.extensionRegistry.setEnabled(extensionId, true);
        // Re-initialize the specific extension
        const extension = this.extensionRegistry.get(extensionId);
        if (extension) {
            const context = this.createExtensionContext(extension);
            // Store the context for later access
            this.extensionContexts.set(extensionId, context);
            await extension.initialize(context);
        }
    }
    /**
     * Disable specific extension
     */
    async disableExtension(extensionId) {
        if (!this.extensionRegistry) {
            throw new Error('No extension registry available');
        }
        const extension = this.extensionRegistry.get(extensionId);
        if (extension) {
            await extension.shutdown();
        }
        this.extensionRegistry.setEnabled(extensionId, false);
    }
    /**
     * Run test with extension enabled
     */
    async withExtension(extensionId, test) {
        const wasEnabled = this.extensionRegistry?.isEnabled(extensionId) || false;
        try {
            await this.enableExtension(extensionId);
            return await test();
        }
        finally {
            if (!wasEnabled) {
                await this.disableExtension(extensionId);
            }
        }
    }
    /**
     * Send MCP request through proxy
     */
    async sendRequest(request) {
        if (!this.proxy) {
            throw new Error('TestHarness not initialized');
        }
        const requestId = request.id || this.requestIdCounter++;
        const fullRequest = {
            ...request,
            id: requestId
        };
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request timeout: ${request.method}`));
                }
            }, 5000);
            this.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeoutId
            });
            // Send request through stdin
            const requestData = JSON.stringify(fullRequest) + '\n';
            this.stdin.writer.write(new TextEncoder().encode(requestData)).catch(error => {
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                    clearTimeout(pending.timeoutId);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                }
            });
        });
    }
    /**
     * Wait for and capture notification
     */
    async expectNotification(method, timeout = 5000) {
        return new Promise((resolve, reject) => {
            console.log('[TEST HARNESS] expectNotification called for method:', method);
            console.log('[TEST HARNESS] Current captured notifications:', this.capturedNotifications.map(n => ({ method: n.method, hasParams: !!n.params })));
            // Check if notification already captured
            const existingNotification = this.capturedNotifications.find(n => n.method === method);
            if (existingNotification) {
                // Remove from captured list and return
                const index = this.capturedNotifications.indexOf(existingNotification);
                this.capturedNotifications.splice(index, 1);
                console.log('[TEST HARNESS] expectNotification returning:', JSON.stringify(existingNotification, null, 2));
                resolve(existingNotification);
                return;
            }
            const timeoutId = setTimeout(() => {
                const waiterIndex = this.notificationWaiters.findIndex(w => w.method === method);
                if (waiterIndex >= 0) {
                    this.notificationWaiters.splice(waiterIndex, 1);
                }
                reject(new Error(`Timeout waiting for notification: ${method}`));
            }, timeout);
            this.notificationWaiters.push({
                method,
                resolve: (notification) => {
                    console.log('[TEST HARNESS] expectNotification waiter resolving:', JSON.stringify(notification, null, 2));
                    resolve(notification);
                },
                reject,
                timeoutId
            });
        });
    }
    /**
     * Get the mock MCP server for configuring test behaviors
     */
    getMockServer() {
        return this.mockServer;
    }
    /**
     * Simulate tool call
     */
    async callTool(toolName, args, progressToken) {
        if (progressToken) {
            this.progressTokens.add(progressToken);
        }
        const requestId = this.requestIdCounter++;
        const request = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args,
                _meta: progressToken ? { progressToken } : undefined
            }
        };
        // Call beforeStdinForward hooks from enabled extensions
        if (this.extensionRegistry) {
            const enabledExtensions = this.extensionRegistry.getEnabled();
            for (const extension of enabledExtensions) {
                const context = this.extensionContexts.get(extension.id);
                if (context?.hooks.beforeStdinForward) {
                    await context.hooks.beforeStdinForward(request);
                }
            }
        }
        // For testing, simulate a large streaming response if the tool name suggests it
        if (toolName.includes('large') || toolName.includes('streaming')) {
            // Simulate streaming response chunks
            const chunks = this.createTestStreamingChunks(5); // 5 chunks
            for (let i = 0; i < chunks.length; i++) {
                const response = {
                    jsonrpc: '2.0',
                    id: requestId,
                    result: {
                        ...chunks[i],
                        isPartial: i < chunks.length - 1
                    }
                };
                // Call afterStdoutReceive hooks
                if (this.extensionRegistry) {
                    const enabledExtensions = this.extensionRegistry.getEnabled();
                    for (const extension of enabledExtensions) {
                        const context = this.extensionContexts.get(extension.id);
                        if (context?.hooks.afterStdoutReceive) {
                            await context.hooks.afterStdoutReceive(response);
                        }
                    }
                }
                // Small delay between chunks
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            // Return the final assembled response
            return { data: chunks.flatMap(c => c.data || []) };
        }
        // For regular tools, just send the request normally
        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(`Tool call failed: ${response.error.message}`);
        }
        return response.result;
    }
    /**
     * Create test streaming chunks
     */
    createTestStreamingChunks(count) {
        const chunks = [];
        const itemsPerChunk = 20;
        for (let i = 0; i < count; i++) {
            const data = Array(itemsPerChunk).fill(null).map((_, j) => ({
                id: i * itemsPerChunk + j,
                value: `test-item-${i * itemsPerChunk + j}`,
                chunk: i,
                largeField: 'x'.repeat(1000) // Make each item ~1KB
            }));
            chunks.push({ data });
        }
        return chunks;
    }
    /**
     * Simulate streaming response
     */
    async streamResponse(chunks, progressToken) {
        if (!progressToken) {
            progressToken = `progress_${Date.now()}`;
            this.progressTokens.add(progressToken);
        }
        for (let i = 0; i < chunks.length; i++) {
            const progress = Math.round(((i + 1) / chunks.length) * 100);
            const notification = {
                jsonrpc: '2.0',
                method: 'notifications/progress',
                params: {
                    progressToken,
                    progress,
                    total: 100,
                    message: `Processing chunk ${i + 1}/${chunks.length}`
                }
            };
            // Simulate sending progress notification
            this.handleNotification(notification);
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    /**
     * Get proxy instance
     */
    getProxy() {
        if (!this.proxy) {
            throw new Error('TestHarness not initialized');
        }
        return this.proxy;
    }
    /**
     * Get extension context for a specific extension
     */
    getExtensionContext(extensionId) {
        if (!this.extensionRegistry) {
            return undefined;
        }
        const extension = this.extensionRegistry.get(extensionId);
        if (!extension) {
            return undefined;
        }
        // Return the context that was created for this extension
        return this.createExtensionContext(extension);
    }
    /**
     * Verify extension state
     */
    verifyExtensionState(extensionId, state) {
        if (!this.extensionRegistry) {
            throw new Error('No extension registry available');
        }
        const extension = this.extensionRegistry.get(extensionId);
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }
        const isEnabled = this.extensionRegistry.isEnabled(extensionId);
        if (state === 'initialized' && !isEnabled) {
            throw new Error(`Extension ${extensionId} is not in initialized state`);
        }
        if (state === 'shutdown' && isEnabled) {
            throw new Error(`Extension ${extensionId} is not in shutdown state`);
        }
    }
    /**
     * Clean up harness
     */
    async cleanup() {
        this.shuttingDown = true;
        // Clear all timeouts
        for (const [, request] of this.pendingRequests) {
            if (request.timeoutId) {
                clearTimeout(request.timeoutId);
            }
            request.reject(new Error('Test harness shutting down'));
        }
        this.pendingRequests.clear();
        for (const waiter of this.notificationWaiters) {
            clearTimeout(waiter.timeoutId);
            waiter.reject(new Error('Test harness shutting down'));
        }
        this.notificationWaiters.length = 0;
        // Stop output monitoring
        this.outputMonitoringActive = false;
        // Shutdown proxy
        if (this.proxy) {
            await this.proxy.shutdown();
            this.proxy = null;
        }
        // Clean up mocks
        this.fs.closeAllWatchers();
        // Disconnect mock server
        if (this.mockServer) {
            this.mockServer.disconnect();
            this.mockServer = null;
        }
        const allProcesses = this.procManager.getAllSpawnedProcesses();
        for (const proc of allProcesses) {
            if (!proc.hasExited()) {
                proc.simulateExit(0);
            }
        }
        // Release stream resources
        try {
            this.stdin.writer.releaseLock();
            this.stdout.reader.releaseLock();
            this.stderr.reader.releaseLock();
        }
        catch {
            // Ignore lock release errors
        }
        // Clear state
        this.progressTokens.clear();
        this.capturedNotifications.length = 0;
        this.extensionContexts.clear();
        this.extensionRegistry = null;
    }
    /**
     * Create mock extension registry
     */
    createMockExtensionRegistry(extensions) {
        const enabledExtensions = new Set();
        const extensionMap = new Map();
        // Register all extensions as enabled by default
        extensions.forEach(ext => {
            extensionMap.set(ext.id, ext);
            if (ext.defaultEnabled) {
                enabledExtensions.add(ext.id);
            }
        });
        return {
            register: (extension) => {
                extensionMap.set(extension.id, extension);
            },
            getAll: () => Array.from(extensionMap.values()),
            getEnabled: () => Array.from(extensionMap.values()).filter(ext => enabledExtensions.has(ext.id)),
            setEnabled: (extensionId, enabled) => {
                if (enabled) {
                    enabledExtensions.add(extensionId);
                }
                else {
                    enabledExtensions.delete(extensionId);
                }
            },
            get: (extensionId) => extensionMap.get(extensionId),
            isEnabled: (extensionId) => enabledExtensions.has(extensionId),
            initializeAll: async (context) => {
                const enabled = Array.from(extensionMap.values()).filter(ext => enabledExtensions.has(ext.id));
                for (const extension of enabled) {
                    const fullContext = this.createExtensionContext(extension, context);
                    // Store the context for later access
                    this.extensionContexts.set(extension.id, fullContext);
                    await extension.initialize(fullContext);
                }
            },
            shutdownAll: async () => {
                const enabled = Array.from(extensionMap.values()).filter(ext => enabledExtensions.has(ext.id));
                for (const extension of enabled) {
                    await extension.shutdown();
                }
            },
            loadBuiltinExtensions: async () => {
                // No-op for test harness
            }
        };
    }
    /**
     * Create extension context
     */
    createExtensionContext(extension, baseContext) {
        // Create a mock notification service that captures notifications
        const notificationService = {
            sendProgress: async (notification) => {
                // Create the full MCP notification format
                const progressNotification = {
                    jsonrpc: '2.0',
                    method: 'notifications/progress',
                    params: notification
                };
                // Debug logging
                console.log('[TEST HARNESS] Sending progress notification:', JSON.stringify(progressNotification, null, 2));
                // Handle the notification as if it came from the server
                this.handleNotification(progressNotification);
            }
        };
        return {
            sessionId: baseContext?.sessionId || `test-session-${Date.now()}`,
            dataDir: baseContext?.dataDir || this.config.dataDir || '/tmp/mcpmon-test',
            config: this.config.extensions?.[extension.id] || {},
            logger: baseContext?.logger || {
                debug: (msg) => console.debug(`[${extension.id}] ${msg}`),
                info: (msg) => console.info(`[${extension.id}] ${msg}`),
                warn: (msg) => console.warn(`[${extension.id}] ${msg}`),
                error: (msg) => console.error(`[${extension.id}] ${msg}`)
            },
            hooks: baseContext?.hooks || {},
            dependencies: baseContext?.dependencies || {
                procManager: this.procManager,
                fs: this.fs,
                stdin: this.stdin.readable,
                stdout: this.stdout.writable,
                stderr: this.stderr.writable,
                exit: () => { }
            },
            notificationService: baseContext?.notificationService || notificationService
        };
    }
    /**
     * Start monitoring proxy output for responses and notifications
     */
    startOutputMonitoring() {
        if (this.outputMonitoringActive)
            return;
        this.outputMonitoringActive = true;
        (async () => {
            const decoder = new TextDecoder();
            let buffer = '';
            while (this.outputMonitoringActive && !this.shuttingDown) {
                try {
                    const { done, value } = await this.stdout.reader.read();
                    if (done)
                        break;
                    const text = decoder.decode(value, { stream: true });
                    buffer += text;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const message = JSON.parse(line);
                                if (message.id !== undefined) {
                                    // This is a response
                                    this.handleResponse(message);
                                }
                                else if (message.method) {
                                    // This is a notification
                                    this.handleNotification(message);
                                }
                            }
                            catch {
                                // Not JSON, ignore
                            }
                        }
                    }
                }
                catch (error) {
                    if (!this.shuttingDown) {
                        console.error('Output monitoring error:', error);
                    }
                    break;
                }
            }
        })();
    }
    /**
     * Handle incoming response
     */
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
        }
    }
    /**
     * Handle incoming notification
     */
    handleNotification(notification) {
        // Debug logging
        console.log('[TEST HARNESS] handleNotification called with:', JSON.stringify(notification, null, 2));
        // Check for waiting notification handlers
        const waiterIndex = this.notificationWaiters.findIndex(w => w.method === notification.method);
        if (waiterIndex >= 0) {
            const waiter = this.notificationWaiters[waiterIndex];
            this.notificationWaiters.splice(waiterIndex, 1);
            clearTimeout(waiter.timeoutId);
            waiter.resolve(notification);
            return;
        }
        // Store for later retrieval
        this.capturedNotifications.push(notification);
        console.log('[TEST HARNESS] Total captured notifications:', this.capturedNotifications.length, 'Methods:', this.capturedNotifications.map(n => n.method));
    }
    /**
     * Wait for proxy to be ready
     */
    async waitForProxyReady() {
        // Wait for at least one process to be spawned
        const startTime = Date.now();
        const timeout = 5000;
        while (Date.now() - startTime < timeout) {
            if (this.procManager.getSpawnCallCount() > 0 && this.proxy?.isRunning()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error('Timeout waiting for proxy to be ready');
    }
}
