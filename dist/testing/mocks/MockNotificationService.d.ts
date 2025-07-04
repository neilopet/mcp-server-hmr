/**
 * Mock implementation of NotificationService for testing
 *
 * Captures progress notifications in memory for test verification
 * instead of sending them to stdout.
 */
import type { NotificationService, ProgressNotification } from '../../extensions/interfaces.js';
/**
 * Mock NotificationService that captures notifications for testing
 */
export declare class MockNotificationService implements NotificationService {
    /** Array to store captured notifications */
    private notifications;
    /**
     * Capture a progress notification
     * @param notification The progress notification to capture
     */
    sendProgress(notification: ProgressNotification): Promise<void>;
    /**
     * Get all captured notifications
     * @returns Copy of the notifications array
     */
    getNotifications(): ProgressNotification[];
    /**
     * Clear all captured notifications
     */
    clear(): void;
}
/**
 * Factory function to create MockNotificationService
 */
export declare function createMockNotificationService(): MockNotificationService;
//# sourceMappingURL=MockNotificationService.d.ts.map