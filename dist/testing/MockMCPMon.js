/**
 * MockMCPMon implementation for unit testing extensions
 *
 * Provides a fully controllable mock environment for testing mcpmon extensions
 * with realistic behavior simulation and comprehensive verification capabilities.
 */
/**
 * Mock implementation of MCPMon for unit testing
 */
export class MockMCPMonImpl {
    capturedMessages = [];
    registeredHooks = {};
    registeredTools = new Map();
    progressNotifications = [];
    hookCalls = new Map();
    contextInstance = null;
    /**
     * Create a mock extension context with test helpers
     */
    createContext(options = {}) {
        const mockLogger = this.createMockLogger();
        const mockDependencies = this.createMockDependencies(options.dependencies);
        const context = {
            dependencies: mockDependencies,
            config: options.config ?? {},
            hooks: this.createHooksProxy(),
            dataDir: options.dataDir ?? '/tmp/mock-mcpmon-data',
            logger: mockLogger,
            sessionId: options.sessionId ?? `mock-session-${Date.now()}`,
            testHelpers: {
                triggerHook: this.triggerHook.bind(this),
                getHookCalls: this.getHookCalls.bind(this)
            }
        };
        this.contextInstance = context;
        return context;
    }
    /**
     * Simulate incoming request through hook processing
     */
    async simulateRequest(request) {
        this.captureMessage('request', 'in', request);
        // Process through beforeStdinForward hook if registered
        let processedRequest = request;
        if (this.registeredHooks.beforeStdinForward) {
            const hookResult = await this.registeredHooks.beforeStdinForward(request);
            if (hookResult === null) {
                // Hook blocked the request
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: -32603,
                        message: 'Request blocked by hook'
                    }
                };
                this.captureMessage('response', 'out', errorResponse);
                return errorResponse;
            }
            processedRequest = hookResult;
        }
        // Handle tool calls
        if (processedRequest.method === 'tools/call') {
            const { name, arguments: args } = processedRequest.params;
            if (this.registeredHooks.handleToolCall) {
                try {
                    const result = await this.registeredHooks.handleToolCall(name, args);
                    if (result !== null) {
                        const response = {
                            jsonrpc: '2.0',
                            id: request.id,
                            result
                        };
                        this.captureMessage('response', 'out', response);
                        return response;
                    }
                }
                catch (error) {
                    const errorResponse = {
                        jsonrpc: '2.0',
                        id: request.id,
                        error: {
                            code: -32603,
                            message: error instanceof Error ? error.message : 'Tool call failed'
                        }
                    };
                    this.captureMessage('response', 'out', errorResponse);
                    return errorResponse;
                }
            }
        }
        // Handle tools/list requests
        if (processedRequest.method === 'tools/list') {
            const additionalTools = this.registeredHooks.getAdditionalTools
                ? await this.registeredHooks.getAdditionalTools()
                : [];
            const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    tools: additionalTools
                }
            };
            this.captureMessage('response', 'out', response);
            return response;
        }
        // Default response for unhandled requests
        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: null
        };
        this.captureMessage('response', 'out', response);
        return response;
    }
    /**
     * Simulate incoming response through hook processing
     */
    async simulateResponse(response) {
        this.captureMessage('response', 'in', response);
        // Process through afterStdoutReceive hook if registered
        let processedResponse = response;
        if (this.registeredHooks.afterStdoutReceive) {
            const hookResult = await this.registeredHooks.afterStdoutReceive(response);
            if (hookResult === null) {
                // Hook blocked the response
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: response.id,
                    error: {
                        code: -32603,
                        message: 'Response blocked by hook'
                    }
                };
                this.captureMessage('response', 'out', errorResponse);
                return errorResponse;
            }
            processedResponse = hookResult;
        }
        this.captureMessage('response', 'out', processedResponse);
        return processedResponse;
    }
    /**
     * Simulate notification
     */
    async simulateNotification(notification) {
        this.captureMessage('notification', 'in', notification);
        // Track progress notifications separately
        if (notification.method === 'notifications/progress') {
            this.progressNotifications.push(notification);
        }
        // Note: Notifications don't typically have response hooks in MCP
        // They're fire-and-forget, but we capture them for testing
    }
    /**
     * Get all captured messages
     */
    getCapturedMessages() {
        return [...this.capturedMessages];
    }
    /**
     * Verify a hook was registered
     */
    expectHookRegistered(hookName) {
        if (!this.registeredHooks[hookName]) {
            throw new Error(`Expected hook '${hookName}' to be registered, but it was not found`);
        }
    }
    /**
     * Verify a tool was registered
     */
    expectToolRegistered(toolName) {
        if (!this.registeredTools.has(toolName)) {
            throw new Error(`Expected tool '${toolName}' to be registered, but it was not found`);
        }
    }
    /**
     * Get all registered hooks
     */
    getRegisteredHooks() {
        return { ...this.registeredHooks };
    }
    /**
     * Get progress notifications
     */
    getProgressNotifications() {
        return [...this.progressNotifications];
    }
    /**
     * Reset all captured data
     */
    reset() {
        this.capturedMessages = [];
        this.registeredHooks = {};
        this.registeredTools.clear();
        this.progressNotifications = [];
        this.hookCalls.clear();
        this.contextInstance = null;
    }
    /**
     * Trigger a hook manually for testing
     */
    async triggerHook(hookName, ...args) {
        // Record the hook call
        if (!this.hookCalls.has(hookName)) {
            this.hookCalls.set(hookName, []);
        }
        this.hookCalls.get(hookName).push(args);
        const hook = this.registeredHooks[hookName];
        if (!hook) {
            throw new Error(`Hook '${hookName}' is not registered`);
        }
        // Call the hook with provided arguments
        if (typeof hook === 'function') {
            return await hook(...args);
        }
        throw new Error(`Hook '${hookName}' is not a function`);
    }
    /**
     * Get all calls made to a specific hook
     */
    getHookCalls(hookName) {
        return this.hookCalls.get(hookName) ?? [];
    }
    /**
     * Create a hooks proxy that captures registered hooks
     */
    createHooksProxy() {
        const proxy = new Proxy({}, {
            set: (target, prop, value) => {
                if (typeof prop === 'string' && prop in target) {
                    this.registeredHooks[prop] = value;
                    // Special handling for getAdditionalTools hook
                    if (prop === 'getAdditionalTools' && typeof value === 'function') {
                        // When tools are registered, capture them for verification
                        value().then((tools) => {
                            tools.forEach(tool => {
                                this.registeredTools.set(tool.name, tool);
                            });
                        }).catch(() => {
                            // Ignore errors during tool registration in testing
                        });
                    }
                }
                return Reflect.set(target, prop, value);
            },
            get: (target, prop) => {
                if (typeof prop === 'string' && prop in this.registeredHooks) {
                    return this.registeredHooks[prop];
                }
                return Reflect.get(target, prop);
            }
        });
        return proxy;
    }
    /**
     * Create mock dependencies
     */
    createMockDependencies(overrides = {}) {
        const mockStdout = overrides.stdout ?? new WritableStream({
            write() {
                // Mock implementation - data is discarded
            }
        });
        const mockStderr = overrides.stderr ?? new WritableStream({
            write() {
                // Mock implementation - data is discarded
            }
        });
        const mockStdin = overrides.stdin ?? new ReadableStream({
            start(controller) {
                // Mock implementation - can be controlled by tests
                controller.close();
            }
        });
        return {
            procManager: {
                spawn: () => {
                    throw new Error('Process spawning not supported in mock context');
                }
            },
            changeSource: {
                watch: async function* () {
                    // Mock implementation - no changes by default
                },
                readFile: async () => '',
                writeFile: async () => { },
                exists: async () => false,
                copyFile: async () => { }
            },
            stdin: mockStdin,
            stdout: mockStdout,
            stderr: mockStderr,
            exit: (code) => {
                // Mock implementation - tests can override this
            }
        };
    }
    /**
     * Create a mock logger that captures log entries
     */
    createMockLogger() {
        const logEntries = [];
        const logger = {
            debug: (message, ...args) => {
                logEntries.push({
                    level: 'debug',
                    message,
                    args,
                    timestamp: Date.now()
                });
            },
            info: (message, ...args) => {
                logEntries.push({
                    level: 'info',
                    message,
                    args,
                    timestamp: Date.now()
                });
            },
            warn: (message, ...args) => {
                logEntries.push({
                    level: 'warn',
                    message,
                    args,
                    timestamp: Date.now()
                });
            },
            error: (message, ...args) => {
                logEntries.push({
                    level: 'error',
                    message,
                    args,
                    timestamp: Date.now()
                });
            },
            log: (level, message, ...args) => {
                logEntries.push({
                    level,
                    message,
                    args,
                    timestamp: Date.now()
                });
            },
            getLogs: () => [...logEntries],
            clear: () => logEntries.length = 0
        };
        return logger;
    }
    /**
     * Capture a message for testing verification
     */
    captureMessage(type, direction, message) {
        this.capturedMessages.push({
            type,
            direction,
            message: JSON.parse(JSON.stringify(message)), // Deep copy
            timestamp: Date.now()
        });
    }
}
/**
 * Factory function to create MockMCPMon instances
 */
export function createMockMCPMon() {
    return new MockMCPMonImpl();
}
