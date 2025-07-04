/**
 * Production implementation of NotificationService that writes to stdout
 *
 * Sends MCP progress notifications through the standard output stream,
 * allowing the proxy to forward them to connected clients.
 */
import type { NotificationService, ProgressNotification } from '../interfaces.js';
/**
 * NotificationService implementation that writes to stdout
 */
export declare class StdoutNotificationService implements NotificationService {
    private stdout;
    constructor(stdout: WritableStream<Uint8Array>);
    /**
     * Send a progress notification by writing to stdout
     * @param notification The progress notification to send
     */
    sendProgress(notification: ProgressNotification): Promise<void>;
}
/**
 * Factory function to create StdoutNotificationService
 */
export declare function createStdoutNotificationService(stdout: WritableStream<Uint8Array>): NotificationService;
//# sourceMappingURL=StdoutNotificationService.d.ts.map