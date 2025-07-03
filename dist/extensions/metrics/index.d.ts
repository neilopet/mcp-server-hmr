/**
 * Metrics Extension for mcpmon
 *
 * Collects and exposes metrics about MCP server operations,
 * including request counts, response times, and error rates.
 */
import type { Extension, ExtensionContext } from '../interfaces.js';
export default class MetricsExtension implements Extension {
    readonly id = "metrics";
    readonly name = "Metrics Collector";
    readonly version = "1.0.0";
    readonly defaultEnabled = false;
    readonly configSchema: {
        type: string;
        properties: {
            collectDurations: {
                type: string;
                description: string;
                default: boolean;
            };
            exposePath: {
                type: string;
                description: string;
                default: string;
            };
            format: {
                type: string;
                enum: string[];
                description: string;
                default: string;
            };
        };
    };
    private metrics;
    private pendingRequests;
    private context?;
    private config;
    initialize(context: ExtensionContext): Promise<void>;
    shutdown(): Promise<void>;
    private beforeStdinForward;
    private afterStdoutReceive;
    private beforeRestart;
    private getAdditionalTools;
    private handleToolCall;
    private formatJson;
    private formatPrometheus;
    private calculateAverageResponseTimes;
    private updateUptime;
    private uptimeInterval?;
    private startUptimeUpdater;
    private stopUptimeUpdater;
}
//# sourceMappingURL=index.d.ts.map