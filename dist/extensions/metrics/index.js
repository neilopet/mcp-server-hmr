/**
 * Metrics Extension for mcpmon
 *
 * Collects and exposes metrics about MCP server operations,
 * including request counts, response times, and error rates.
 */
export default class MetricsExtension {
    id = 'metrics';
    name = 'Metrics Collector';
    version = '1.0.0';
    defaultEnabled = false;
    configSchema = {
        type: 'object',
        properties: {
            collectDurations: {
                type: 'boolean',
                description: 'Collect request duration metrics',
                default: true
            },
            exposePath: {
                type: 'string',
                description: 'Path to expose metrics (if HTTP server enabled)',
                default: '/metrics'
            },
            format: {
                type: 'string',
                enum: ['json', 'prometheus'],
                description: 'Metrics output format',
                default: 'json'
            }
        }
    };
    metrics = {
        requests: { total: 0, byMethod: {} },
        responses: { total: 0, errors: 0, byMethod: {} },
        tools: { calls: {}, errors: {}, durations: {} },
        restarts: 0,
        uptime: 0,
        startTime: Date.now()
    };
    pendingRequests = new Map();
    context;
    config = {};
    async initialize(context) {
        this.context = context;
        this.config = context.config;
        this.metrics.startTime = Date.now();
        // Register hooks
        context.hooks.beforeStdinForward = this.beforeStdinForward.bind(this);
        context.hooks.afterStdoutReceive = this.afterStdoutReceive.bind(this);
        context.hooks.beforeRestart = this.beforeRestart.bind(this);
        context.hooks.getAdditionalTools = this.getAdditionalTools.bind(this);
        context.hooks.handleToolCall = this.handleToolCall.bind(this);
        // Update uptime periodically
        this.startUptimeUpdater();
        context.logger.info('Metrics collector initialized');
    }
    async shutdown() {
        this.stopUptimeUpdater();
        this.context = undefined;
    }
    async beforeStdinForward(message) {
        // Track requests
        this.metrics.requests.total++;
        if (message.method) {
            this.metrics.requests.byMethod[message.method] =
                (this.metrics.requests.byMethod[message.method] || 0) + 1;
            // Track pending requests for response time calculation
            if (message.id) {
                this.pendingRequests.set(message.id, {
                    method: message.method,
                    startTime: Date.now(),
                    toolName: message.method === 'tools/call' ? message.params?.name : undefined
                });
            }
            // Track tool calls specifically
            if (message.method === 'tools/call' && message.params?.name) {
                const toolName = message.params.name;
                this.metrics.tools.calls[toolName] = (this.metrics.tools.calls[toolName] || 0) + 1;
            }
        }
        return message;
    }
    async afterStdoutReceive(message) {
        // Track responses
        this.metrics.responses.total++;
        // Match with pending request
        if (message.id && this.pendingRequests.has(message.id)) {
            const pending = this.pendingRequests.get(message.id);
            const duration = Date.now() - pending.startTime;
            this.metrics.responses.byMethod[pending.method] =
                (this.metrics.responses.byMethod[pending.method] || 0) + 1;
            // Track errors
            if (message.error) {
                this.metrics.responses.errors++;
                if (pending.toolName) {
                    this.metrics.tools.errors[pending.toolName] =
                        (this.metrics.tools.errors[pending.toolName] || 0) + 1;
                }
            }
            // Track durations
            if (this.config.collectDurations && pending.toolName) {
                if (!this.metrics.tools.durations[pending.toolName]) {
                    this.metrics.tools.durations[pending.toolName] = [];
                }
                this.metrics.tools.durations[pending.toolName].push(duration);
                // Keep only last 100 durations per tool
                if (this.metrics.tools.durations[pending.toolName].length > 100) {
                    this.metrics.tools.durations[pending.toolName].shift();
                }
            }
            this.pendingRequests.delete(message.id);
        }
        return message;
    }
    async beforeRestart() {
        this.metrics.restarts++;
    }
    async getAdditionalTools() {
        return [
            {
                name: "mcpmon.get-metrics",
                description: "Get current metrics from mcpmon",
                inputSchema: {
                    type: "object",
                    properties: {
                        format: {
                            type: "string",
                            enum: ["json", "prometheus"],
                            description: "Output format for metrics"
                        }
                    }
                }
            }
        ];
    }
    async handleToolCall(toolName, args) {
        if (toolName !== 'mcpmon.get-metrics')
            return null;
        this.updateUptime();
        const format = args.format || this.config.format || 'json';
        if (format === 'prometheus') {
            return this.formatPrometheus();
        }
        return this.formatJson();
    }
    formatJson() {
        return {
            status: 'success',
            metrics: {
                ...this.metrics,
                avgResponseTimes: this.calculateAverageResponseTimes()
            }
        };
    }
    formatPrometheus() {
        const lines = [
            '# HELP mcpmon_requests_total Total number of requests',
            '# TYPE mcpmon_requests_total counter',
            `mcpmon_requests_total ${this.metrics.requests.total}`,
            '',
            '# HELP mcpmon_responses_total Total number of responses',
            '# TYPE mcpmon_responses_total counter',
            `mcpmon_responses_total ${this.metrics.responses.total}`,
            '',
            '# HELP mcpmon_errors_total Total number of errors',
            '# TYPE mcpmon_errors_total counter',
            `mcpmon_errors_total ${this.metrics.responses.errors}`,
            '',
            '# HELP mcpmon_restarts_total Total number of restarts',
            '# TYPE mcpmon_restarts_total counter',
            `mcpmon_restarts_total ${this.metrics.restarts}`,
            '',
            '# HELP mcpmon_uptime_seconds Uptime in seconds',
            '# TYPE mcpmon_uptime_seconds gauge',
            `mcpmon_uptime_seconds ${this.metrics.uptime}`,
        ];
        // Add method-specific metrics
        for (const [method, count] of Object.entries(this.metrics.requests.byMethod)) {
            lines.push(`# HELP mcpmon_requests_by_method{method="${method}"} Requests by method`, `# TYPE mcpmon_requests_by_method counter`, `mcpmon_requests_by_method{method="${method}"} ${count}`);
        }
        return {
            status: 'success',
            format: 'prometheus',
            metrics: lines.join('\n')
        };
    }
    calculateAverageResponseTimes() {
        const averages = {};
        for (const [tool, durations] of Object.entries(this.metrics.tools.durations)) {
            if (durations.length > 0) {
                const sum = durations.reduce((a, b) => a + b, 0);
                averages[tool] = Math.round(sum / durations.length);
            }
        }
        return averages;
    }
    updateUptime() {
        this.metrics.uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    }
    uptimeInterval;
    startUptimeUpdater() {
        this.uptimeInterval = setInterval(() => this.updateUptime(), 1000);
    }
    stopUptimeUpdater() {
        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
            this.uptimeInterval = undefined;
        }
    }
}
