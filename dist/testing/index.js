/**
 * MCPMon Testing Framework
 *
 * A comprehensive testing framework for MCPMon extensions.
 * This is the main entry point for extension developers.
 *
 * @module @mcpmon/testing
 */
import { testContainer } from './TestContainer.js';
import { ExtensionTestDiscovery } from './discovery.js';
// Export test symbols
export { TEST_TYPES } from './types.js';
// ============================================================================
// Core Utilities
// ============================================================================
/**
 * Test Container - Dependency injection container for test framework
 */
export { TestContainer, testContainer, register, getTestSuite, getAllTestSuites } from './TestContainer.js';
/**
 * Test Discovery - Automatic discovery and loading of extension test suites
 */
export { ExtensionTestDiscovery, TestPathUtils, TestDiscoveryError } from './discovery.js';
/**
 * Mock MCPMon - Mock implementation for unit testing
 */
export { createMockMCPMon } from './MockMCPMon.js';
/**
 * Test Harness - Integration testing utilities
 */
export { MCPMonTestHarness } from './MCPMonTestHarness.js';
// ============================================================================
// E2E Testing
// ============================================================================
/**
 * E2E Client Simulators
 */
export { BaseMCPClientSimulator, ClaudeDesktopSimulator, MCPInspectorSimulator, CustomClientSimulator, E2ETestContextImpl, E2EScenarioBuilder, E2ETestContextFactory, MockMCPStream, NetworkMCPStream } from './e2e/MCPClientSimulator.js';
// ============================================================================
// Test Utilities
// ============================================================================
/**
 * Create a test suite with metadata
 */
export function defineTestSuite(metadata, setupFn) {
    return {
        extensionId: metadata.extensionId,
        metadata,
        setupTests: setupFn,
        teardownTests: async () => {
            // Default teardown
        }
    };
}
/**
 * Quick test setup helper
 */
export async function setupTestEnvironment() {
    // Initialize test container
    testContainer.bindTestUtilities();
    // Discover extension tests
    await ExtensionTestDiscovery.discoverAndRegister();
}
/**
 * Run all discovered test suites
 */
export async function runAllTestSuites(filter) {
    const suites = ExtensionTestDiscovery.getAllTestSuites(filter);
    for (const suite of suites) {
        if (suite.metadata.enabled !== false) {
            await suite.setupTests();
            // Tests would be run here by Jest
            await suite.teardownTests();
        }
    }
}
// ============================================================================
// Re-exports for convenience
// ============================================================================
// Export commonly used decorators
export { injectable, inject } from 'inversify';
// Export Jest globals for extension tests
export { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
