/**
 * E2E Testing Module - Exports for comprehensive end-to-end testing
 *
 * This module provides all the necessary components for E2E testing of MCP clients:
 * - Client simulators for different MCP client types
 * - Test context implementations
 * - Scenario builders and runners
 * - Stream implementations for both mock and real network communication
 */
export { 
// Stream implementations
MockMCPStream, NetworkMCPStream, 
// Client simulators
BaseMCPClientSimulator, ClaudeDesktopSimulator, MCPInspectorSimulator, CustomClientSimulator, 
// Test context and utilities
E2ETestContextImpl, E2EScenarioBuilder, E2ETestContextFactory, } from './MCPClientSimulator.js';
// Convenience exports for common testing patterns
export * as E2ETestUtils from './MCPClientSimulator.js';
