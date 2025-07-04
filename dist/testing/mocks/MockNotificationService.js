/**
 * Mock implementation of NotificationService for testing
 *
 * Captures progress notifications in memory for test verification
 * instead of sending them to stdout.
 */
/**
 * Mock NotificationService that captures notifications for testing
 */
export class MockNotificationService {
    /** Array to store captured notifications */
    notifications = [];
    /**
     * Capture a progress notification
     * @param notification The progress notification to capture
     */
    async sendProgress(notification) {
        // Store a copy to prevent external modifications
        this.notifications.push({
            progressToken: notification.progressToken,
            progress: notification.progress,
            total: notification.total,
            message: notification.message
        });
    }
    /**
     * Get all captured notifications
     * @returns Copy of the notifications array
     */
    getNotifications() {
        // Return a copy to prevent external modifications
        return [...this.notifications];
    }
    /**
     * Clear all captured notifications
     */
    clear() {
        this.notifications = [];
    }
}
/**
 * Factory function to create MockNotificationService
 */
export function createMockNotificationService() {
    return new MockNotificationService();
}
