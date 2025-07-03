/**
 * E2E Testing Module - Exports for comprehensive end-to-end testing
 *
 * This module provides all the necessary components for E2E testing of MCP clients:
 * - Client simulators for different MCP client types
 * - Test context implementations
 * - Scenario builders and runners
 * - Stream implementations for both mock and real network communication
 */
export { type E2ETestContext, type MCPClientSimulator, type E2EScenario, type ScenarioResult, type ScenarioStep, type ScenarioAssertion, type ClientConfig, } from '../types.js';
export { type InitializeRequest, type InitializeResponse, type ListToolsRequest, type ListToolsResponse, type CallToolRequest, type CallToolResponse, type MCPClientCapabilities, type MCPServerCapabilities, type MCPTool, type MCPContent, type MCPStream, MockMCPStream, NetworkMCPStream, BaseMCPClientSimulator, ClaudeDesktopSimulator, MCPInspectorSimulator, CustomClientSimulator, E2ETestContextImpl, E2EScenarioBuilder, E2ETestContextFactory, } from './MCPClientSimulator.js';
export * as E2ETestUtils from './MCPClientSimulator.js';
//# sourceMappingURL=index.d.ts.map