#!/usr/bin/env node
/**
 * Setup utility for mcpmon
 *
 * Configures MCP servers to use mcpmon hot-reload proxy by modifying
 * Claude Desktop or Claude Code configuration files.
 *
 * Usage:
 *   mcpmon setup <server-name>     # Setup specific server
 *   mcpmon setup --all             # Setup all stdio servers
 *   mcpmon setup --list            # List available servers
 *   mcpmon setup --restore         # Restore from backup
 */
/**
 * Main setup function (legacy - for backward compatibility)
 */
export declare function setup(args: string[]): void;
/**
 * Commander.js setup function
 */
export declare function setupCommand(serverName: string | undefined, options: any): void;
//# sourceMappingURL=setup.d.ts.map