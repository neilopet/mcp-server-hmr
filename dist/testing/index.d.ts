/**
 * MCPMon Testing Framework
 *
 * A comprehensive testing framework for MCPMon extensions.
 * This is the main entry point for extension developers.
 *
 * @module @mcpmon/testing
 */
import type { ExtensionTestSuite, TestSuiteMetadata, TestFilter } from './types.js';
/**
 * Core types and interfaces for the testing framework
 */
export type { ExtensionTestSuite, TestSuite, TestSuiteMetadata, TestFilter, MockMCPMon, MockExtensionContext, TestHarness, E2ETestContext, ExtensionId, ExtensionInstance, MCPRequest, MCPResponse, MCPNotification, CapturedMessage, ProgressNotification, TestSuiteOptions, ExtensionTestLoader, ValidationResult, Extension, ExtensionContext, ExtensionHooks } from './types.js';
export { TEST_TYPES } from './types.js';
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
/**
 * E2E Client Simulators
 */
export { BaseMCPClientSimulator, ClaudeDesktopSimulator, MCPInspectorSimulator, CustomClientSimulator, E2ETestContextImpl, E2EScenarioBuilder, E2ETestContextFactory, MockMCPStream, NetworkMCPStream } from './e2e/MCPClientSimulator.js';
/**
 * Create a test suite with metadata
 */
export declare function defineTestSuite(metadata: TestSuiteMetadata, setupFn: () => void | Promise<void>): ExtensionTestSuite;
/**
 * Quick test setup helper
 */
export declare function setupTestEnvironment(): Promise<void>;
/**
 * Run all discovered test suites
 */
export declare function runAllTestSuites(filter?: TestFilter): Promise<void>;
export { injectable, inject } from 'inversify';
export { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
//# sourceMappingURL=index.d.ts.map