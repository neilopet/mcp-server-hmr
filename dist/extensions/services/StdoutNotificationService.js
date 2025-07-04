/**
 * Production implementation of NotificationService that writes to stdout
 *
 * Sends MCP progress notifications through the standard output stream,
 * allowing the proxy to forward them to connected clients.
 */
/**
 * NotificationService implementation that writes to stdout
 */
export class StdoutNotificationService {
    stdout;
    constructor(stdout) {
        this.stdout = stdout;
    }
    /**
     * Send a progress notification by writing to stdout
     * @param notification The progress notification to send
     */
    async sendProgress(notification) {
        // Create MCP progress notification message
        const progressMessage = {
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: notification
        };
        // Encode and write to stdout
        const encoder = new TextEncoder();
        const writer = this.stdout.getWriter();
        try {
            await writer.write(encoder.encode(JSON.stringify(progressMessage) + '\n'));
        }
        finally {
            writer.releaseLock();
        }
    }
}
/**
 * Factory function to create StdoutNotificationService
 */
export function createStdoutNotificationService(stdout) {
    return new StdoutNotificationService(stdout);
}
