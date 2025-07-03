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
  // Main interfaces (re-exported from types)
  type E2ETestContext,
  type MCPClientSimulator,
  type E2EScenario,
  type ScenarioResult,
  type ScenarioStep,
  type ScenarioAssertion,
  type ClientConfig,
} from '../types.js';

export {
  // MCP Protocol types
  type InitializeRequest,
  type InitializeResponse,
  type ListToolsRequest,
  type ListToolsResponse,
  type CallToolRequest,
  type CallToolResponse,
  type MCPClientCapabilities,
  type MCPServerCapabilities,
  type MCPTool,
  type MCPContent,
  type MCPStream,
  
  // Stream implementations
  MockMCPStream,
  NetworkMCPStream,
  
  // Client simulators
  BaseMCPClientSimulator,
  ClaudeDesktopSimulator,
  MCPInspectorSimulator,
  CustomClientSimulator,
  
  // Test context and utilities
  E2ETestContextImpl,
  E2EScenarioBuilder,
  E2ETestContextFactory,
} from './MCPClientSimulator.js';

// Convenience exports for common testing patterns
export * as E2ETestUtils from './MCPClientSimulator.js';