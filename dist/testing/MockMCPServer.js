/**
 * Mock MCP Server for Testing
 *
 * Provides a configurable mock implementation of an MCP server that can be used
 * in integration tests to simulate server responses, streaming behaviors, and
 * error conditions without requiring a real MCP server process.
 */
/**
 * Error types for MCP operations
 */
export class MCPError extends Error {
    code;
    data;
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = 'MCPError';
    }
}
/**
 * Common MCP error codes
 */
export const MCPErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    TOOL_NOT_FOUND: -1,
    TOOL_EXECUTION_ERROR: -2
};
/**
 * MockMCPServer implementation
 *
 * Simulates an MCP server for testing purposes by handling requests
 * and generating appropriate responses.
 */
export class MockMCPServerImpl {
    toolHandlers = new Map();
    requestHandlers = new Map();
    stdin;
    stdout;
    reader;
    writer;
    connected = false;
    currentRequestId = null;
    constructor() {
        // Set up default handlers
        this.setupDefaultHandlers();
    }
    /**
     * Set up default handlers for common MCP requests
     */
    setupDefaultHandlers() {
        // Default tools/list handler
        this.onRequest('tools/list', async () => ({
            tools: []
        }));
        // Default capabilities handler
        this.onRequest('initialize', async () => ({
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'MockMCPServer',
                version: '1.0.0'
            }
        }));
    }
    onToolCall(toolName, handler) {
        this.toolHandlers.set(toolName, handler);
    }
    onRequest(method, handler) {
        this.requestHandlers.set(method, handler);
    }
    async streamResponse(chunks, progressToken, config) {
        if (!this.writer || !this.currentRequestId) {
            throw new Error('MockMCPServer not connected or no active request');
        }
        const chunkDelay = config?.chunkDelay ?? 10;
        const sendProgress = config?.sendProgress ?? true;
        const progressInterval = config?.progressInterval ?? 100;
        let lastProgressTime = 0;
        for (let i = 0; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            const now = Date.now();
            // Send progress notification if needed
            if (progressToken && sendProgress && (now - lastProgressTime) >= progressInterval) {
                await this.sendProgressNotification(progressToken, i + 1, chunks.length, `Processing chunk ${i + 1}/${chunks.length}`);
                lastProgressTime = now;
            }
            // Send chunk response
            const response = this.formatResponse(this.currentRequestId, {
                ...chunks[i],
                isPartial: !isLast
            });
            await this.writeMessage(response);
            // Delay between chunks (except for the last one)
            if (!isLast && chunkDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, chunkDelay));
            }
        }
    }
    async sendResponse(response) {
        if (!this.writer || !this.currentRequestId) {
            throw new Error('MockMCPServer not connected or no active request');
        }
        const mcpResponse = this.formatResponse(this.currentRequestId, response);
        await this.writeMessage(mcpResponse);
    }
    async sendError(error) {
        if (!this.writer || !this.currentRequestId) {
            throw new Error('MockMCPServer not connected or no active request');
        }
        const mcpResponse = this.formatError(this.currentRequestId, error);
        await this.writeMessage(mcpResponse);
    }
    connect(stdin, stdout) {
        this.stdin = stdin;
        this.stdout = stdout;
        this.reader = stdin.getReader();
        this.writer = stdout.getWriter();
        this.connected = true;
        // Start listening for requests
        this.startListening();
    }
    disconnect() {
        this.connected = false;
        try {
            this.reader?.releaseLock();
            this.writer?.releaseLock();
        }
        catch {
            // Ignore lock release errors
        }
        this.reader = undefined;
        this.writer = undefined;
        this.stdin = undefined;
        this.stdout = undefined;
        this.currentRequestId = null;
    }
    reset() {
        this.toolHandlers.clear();
        this.requestHandlers.clear();
        this.setupDefaultHandlers();
        this.currentRequestId = null;
    }
    isConnected() {
        return this.connected;
    }
    /**
     * Start listening for incoming requests
     */
    async startListening() {
        if (!this.reader)
            return;
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (this.connected) {
                const { done, value } = await this.reader.read();
                if (done)
                    break;
                const text = decoder.decode(value, { stream: true });
                buffer += text;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) {
                        await this.handleIncomingMessage(line);
                    }
                }
            }
        }
        catch (error) {
            if (this.connected) {
                console.error('MockMCPServer: Error reading from stdin:', error);
            }
        }
    }
    /**
     * Handle incoming JSON-RPC message
     */
    async handleIncomingMessage(line) {
        try {
            const request = this.parseRequest(line);
            this.currentRequestId = request.id;
            await this.routeRequest(request);
        }
        catch (error) {
            console.error('MockMCPServer: Error handling message:', error);
            if (this.currentRequestId) {
                await this.sendError({
                    code: MCPErrorCodes.PARSE_ERROR,
                    message: 'Failed to parse request',
                    data: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    /**
     * Parse incoming request
     */
    parseRequest(data) {
        try {
            return JSON.parse(data);
        }
        catch (error) {
            throw new MCPError(MCPErrorCodes.PARSE_ERROR, 'Invalid JSON in request', { originalData: data });
        }
    }
    /**
     * Route request to appropriate handler
     */
    async routeRequest(request) {
        const context = {
            requestId: request.id,
            progressToken: request.params?._meta?.progressToken,
            method: request.method,
            request
        };
        try {
            let result;
            // Handle tool calls specially
            if (request.method === 'tools/call') {
                const toolName = request.params?.name;
                if (!toolName) {
                    throw new MCPError(MCPErrorCodes.INVALID_PARAMS, 'Tool name is required');
                }
                const handler = this.toolHandlers.get(toolName);
                if (!handler) {
                    throw new MCPError(MCPErrorCodes.TOOL_NOT_FOUND, `Tool '${toolName}' not found`);
                }
                result = await handler(request.params?.arguments || {}, context);
            }
            else {
                // Handle other methods
                const handler = this.requestHandlers.get(request.method);
                if (!handler) {
                    throw new MCPError(MCPErrorCodes.METHOD_NOT_FOUND, `Method '${request.method}' not found`);
                }
                result = await handler(request.params || {}, context);
            }
            // If handler didn't send response via streamResponse, send it now
            if (this.currentRequestId === request.id) {
                await this.sendResponse(result);
            }
        }
        catch (error) {
            if (error instanceof MCPError) {
                await this.sendError({
                    code: error.code,
                    message: error.message,
                    data: error.data
                });
            }
            else {
                await this.sendError({
                    code: MCPErrorCodes.INTERNAL_ERROR,
                    message: 'Internal server error',
                    data: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    /**
     * Format successful response
     */
    formatResponse(id, result) {
        return {
            jsonrpc: '2.0',
            id,
            result
        };
    }
    /**
     * Format error response
     */
    formatError(id, error) {
        return {
            jsonrpc: '2.0',
            id,
            error
        };
    }
    /**
     * Send progress notification
     */
    async sendProgressNotification(progressToken, progress, total, message) {
        const notification = {
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: {
                progressToken,
                progress,
                ...(total !== undefined && { total }),
                ...(message && { message })
            }
        };
        await this.writeMessage(notification);
    }
    /**
     * Write message to stdout
     */
    async writeMessage(message) {
        if (!this.writer) {
            throw new Error('MockMCPServer not connected');
        }
        const json = JSON.stringify(message) + '\n';
        const encoded = new TextEncoder().encode(json);
        await this.writer.write(encoded);
    }
}
/**
 * Factory function to create MockMCPServer
 */
export function createMockMCPServer() {
    return new MockMCPServerImpl();
}
