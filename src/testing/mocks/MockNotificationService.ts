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
export class MockNotificationService implements NotificationService {
  /** Array to store captured notifications */
  private notifications: ProgressNotification[] = [];

  /**
   * Capture a progress notification
   * @param notification The progress notification to capture
   */
  async sendProgress(notification: ProgressNotification): Promise<void> {
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
  getNotifications(): ProgressNotification[] {
    // Return a copy to prevent external modifications
    return [...this.notifications];
  }

  /**
   * Clear all captured notifications
   */
  clear(): void {
    this.notifications = [];
  }
}

/**
 * Factory function to create MockNotificationService
 */
export function createMockNotificationService(): MockNotificationService {
  return new MockNotificationService();
}