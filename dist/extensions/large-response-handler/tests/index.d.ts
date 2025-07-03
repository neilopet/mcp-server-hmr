/**
 * Large Response Handler Extension Tests - DI Pattern
 *
 * Test suite implementation using the new dependency injection framework
 * for comprehensive testing of streaming, buffering, and large response handling.
 */
import type { ExtensionTestSuite, MockMCPMon, TestHarness } from '../../../testing/types.js';
import LargeResponseHandlerExtension from '../index.js';
import type { LRHTestUtilities } from './providers.js';
/**
 * Large Response Handler Test Suite
 * Uses DI pattern for clean dependency management and test isolation
 */
export declare class LargeResponseHandlerTestSuite implements ExtensionTestSuite {
    private mockMCPMon;
    private testHarness;
    private lrhUtils;
    readonly extensionId = "large-response-handler";
    readonly extension: LargeResponseHandlerExtension;
    readonly metadata: {
        extensionId: "large-response-handler";
        name: string;
        description: string;
        version: string;
        tags: string[];
        timeout: number;
        enabled: boolean;
    };
    constructor(mockMCPMon: MockMCPMon, testHarness: TestHarness, lrhUtils: LRHTestUtilities);
    setupTests(): Promise<void>;
    teardownTests(): Promise<void>;
    /**
     * Test extension initialization and configuration
     */
    private defineInitializationTests;
    /**
     * Test large response detection logic
     */
    private defineResponseDetectionTests;
    /**
     * Test streaming response handling
     */
    private defineStreamingTests;
    /**
     * Test tool injection functionality
     */
    private defineToolInjectionTests;
    /**
     * Test LRH-specific tool calls
     */
    private defineToolCallTests;
    /**
     * Test progress notification functionality
     */
    private defineProgressNotificationTests;
    /**
     * Test integration scenarios
     */
    private defineIntegrationTests;
}
export default LargeResponseHandlerTestSuite;
//# sourceMappingURL=index.d.ts.map