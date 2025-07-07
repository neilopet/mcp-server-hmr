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
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { platform } from 'process';
import { execSync } from 'child_process';
/**
 * Detect the latest Node.js version available in nvm
 */
function findLatestNodeVersion() {
    const home = homedir();
    const nvmDir = join(home, '.nvm', 'versions', 'node');
    try {
        if (!existsSync(nvmDir)) {
            return null;
        }
        const versions = readdirSync(nvmDir)
            .filter(dir => dir.startsWith('v'))
            .map(dir => ({
            version: dir,
            major: parseInt(dir.slice(1).split('.')[0], 10),
            minor: parseInt(dir.slice(1).split('.')[1], 10),
            patch: parseInt(dir.slice(1).split('.')[2], 10)
        }))
            .filter(v => !isNaN(v.major) && !isNaN(v.minor) && !isNaN(v.patch))
            .sort((a, b) => {
            if (a.major !== b.major)
                return b.major - a.major;
            if (a.minor !== b.minor)
                return b.minor - a.minor;
            return b.patch - a.patch;
        });
        if (versions.length === 0) {
            return null;
        }
        // Return the latest version that's >= 16
        const suitable = versions.find(v => v.major >= 16);
        if (suitable) {
            return join(nvmDir, suitable.version, 'bin', 'node');
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
/**
 * Get the command and args to run mcpmon with a modern Node.js version
 */
function getMcpmonCommand() {
    const modernNode = findLatestNodeVersion();
    if (modernNode && existsSync(modernNode)) {
        // Try to find mcpmon binary path
        try {
            const mcpmonPath = execSync('which mcpmon', { encoding: 'utf8' }).trim();
            if (mcpmonPath && existsSync(mcpmonPath)) {
                return {
                    command: modernNode,
                    args: [mcpmonPath, '--enable-extension', 'large-response-handler']
                };
            }
        }
        catch (e) {
            // Fall through to fallback
        }
    }
    // Fallback to system mcpmon (may fail on old Node.js)
    return {
        command: 'mcpmon',
        args: ['--enable-extension', 'large-response-handler']
    };
}
/**
 * Check if a server uses stdio transport (not SSE or HTTP)
 */
function isStdioServer(serverConfig) {
    // Check for explicit transport specification
    if (serverConfig.transport) {
        return serverConfig.transport === 'stdio';
    }
    // Check for SSE/HTTP indicators
    const command = serverConfig.command.toLowerCase();
    const args = (serverConfig.args || []).join(' ').toLowerCase();
    const fullCommand = `${command} ${args}`;
    // Common SSE/HTTP server indicators
    if (fullCommand.includes('--port') ||
        fullCommand.includes('--http') ||
        fullCommand.includes('--sse') ||
        fullCommand.includes('server.listen') ||
        fullCommand.includes('express') ||
        fullCommand.includes('fastify')) {
        return false;
    }
    // Docker containers often use stdio
    if (command === 'docker' && args.includes('-i')) {
        return true;
    }
    // Default to stdio for most servers
    return true;
}
/**
 * Parse a command string into command and args array
 */
function parseCommandString(cmdString) {
    // Simple parsing - split by spaces, handling quoted strings
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < cmdString.length; i++) {
        const char = cmdString[i];
        if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
        }
        else if (char === ' ' && !inQuotes) {
            if (current) {
                parts.push(current);
                current = '';
            }
        }
        else {
            current += char;
        }
    }
    if (current) {
        parts.push(current);
    }
    return {
        command: parts[0] || '',
        args: parts.slice(1)
    };
}
/**
 * Check if a server is already configured with mcpmon
 */
function isAlreadyConfigured(serverConfig) {
    // Check if command is already mcpmon or a Node.js path running mcpmon
    if (serverConfig.command === 'mcpmon') {
        return true;
    }
    // Check if it's Node.js running mcpmon
    if (serverConfig.command.includes('node') &&
        serverConfig.args &&
        serverConfig.args.length > 0 &&
        serverConfig.args[0].includes('mcpmon')) {
        return true;
    }
    return false;
}
/**
 * Extract the original server configuration from a mcpmon-wrapped config
 */
function unwrapMcpmonConfig(serverConfig) {
    // If it's mcpmon command directly
    if (serverConfig.command === 'mcpmon' && serverConfig.args && serverConfig.args.length >= 1) {
        return {
            command: serverConfig.args[0],
            args: serverConfig.args.slice(1),
            env: serverConfig.env,
            cwd: serverConfig.cwd,
            transport: serverConfig.transport
        };
    }
    // If it's Node.js running mcpmon
    if (serverConfig.command.includes('node') &&
        serverConfig.args &&
        serverConfig.args.length >= 2 &&
        serverConfig.args[0].includes('mcpmon')) {
        return {
            command: serverConfig.args[1],
            args: serverConfig.args.slice(2),
            env: serverConfig.env,
            cwd: serverConfig.cwd,
            transport: serverConfig.transport
        };
    }
    // Return as-is if not wrapped
    return serverConfig;
}
/**
 * Find config file in standard locations
 */
function findConfigFile(providedPath) {
    // If path is provided, use it directly
    if (providedPath) {
        const resolvedPath = resolve(providedPath);
        if (existsSync(resolvedPath)) {
            return resolvedPath;
        }
        console.error(`❌ Config file not found: ${resolvedPath}`);
        return null;
    }
    // Search in default locations
    const searchPaths = [];
    const home = homedir();
    // 1. Claude Code project config
    const projectMcpPath = resolve('.mcp.json');
    searchPaths.push(projectMcpPath);
    // 2. Claude Code config
    searchPaths.push(resolve(home, '.claude.json'));
    // 3. Claude Desktop config (platform-specific)
    if (platform === 'darwin') {
        searchPaths.push(resolve(home, 'Library/Application Support/Claude/claude_desktop_config.json'));
    }
    else if (platform === 'win32') {
        const appData = process.env.APPDATA;
        if (appData) {
            searchPaths.push(resolve(appData, 'Claude/claude_desktop_config.json'));
        }
    }
    else if (platform === 'linux') {
        searchPaths.push(resolve(home, '.config/Claude/claude_desktop_config.json'));
    }
    // 4. Current directory mcpServers.json
    searchPaths.push(resolve('./mcpServers.json'));
    // Check each path
    for (const path of searchPaths) {
        if (existsSync(path)) {
            console.log(`📋 Found config at: ${path}`);
            return path;
        }
    }
    return null;
}
/**
 * List available servers in the config
 */
function listServers(config, configPath) {
    const serverNames = Object.keys(config.mcpServers);
    if (serverNames.length === 0) {
        console.log('No servers found in config file');
        return;
    }
    console.log(`Available servers in ${configPath}:\n`);
    for (const name of serverNames) {
        const server = config.mcpServers[name];
        const isStdio = isStdioServer(server);
        console.log(`  📦 ${name} ${isStdio ? '(stdio)' : '(HTTP/SSE)'}`);
        console.log(`     Command: ${server.command} ${(server.args || []).join(' ')}`);
        if (server.cwd)
            console.log(`     Working Dir: ${server.cwd}`);
        if (server.env)
            console.log(`     Env Vars: ${Object.keys(server.env).join(', ')}`);
        console.log();
    }
}
/**
 * Setup hot-reload for selected servers
 */
async function setupHotReload(config, configPath, serverName, setupAll, isClaudeCode) {
    console.log(`🔧 Setting up hot-reload proxy...`);
    console.log(`📋 Config: ${configPath}`);
    // Create backup
    const backupPath = configPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    try {
        copyFileSync(configPath, backupPath);
        console.log(`💾 Backup created: ${backupPath}`);
    }
    catch (error) {
        console.error(`❌ Failed to create backup: ${error.message}`);
        process.exit(1);
    }
    // Determine which servers to setup
    let serversToSetup = [];
    if (setupAll) {
        // Setup all stdio servers
        serversToSetup = Object.entries(config.mcpServers)
            .filter(([_, cfg]) => isStdioServer(cfg))
            .map(([name]) => name);
        if (serversToSetup.length === 0) {
            console.error(`❌ No stdio servers found to setup`);
            process.exit(1);
        }
        console.log(`\n📦 Found ${serversToSetup.length} stdio servers to setup:`);
        serversToSetup.forEach((name) => console.log(`   - ${name}`));
    }
    else if (serverName) {
        // Setup specific server
        if (!config.mcpServers[serverName]) {
            console.error(`❌ Server '${serverName}' not found in config`);
            process.exit(1);
        }
        if (!isStdioServer(config.mcpServers[serverName])) {
            console.error(`❌ Server '${serverName}' appears to use HTTP/SSE transport, not stdio`);
            console.error(`   Hot-reload proxy only supports stdio servers`);
            process.exit(1);
        }
        serversToSetup = [serverName];
    }
    else {
        console.error(`❌ Please specify a server name or use --all`);
        process.exit(1);
    }
    // Replace each server with hot-reload version
    const newConfig = { ...config };
    const modifiedServers = [];
    // Get mcpmon command with modern Node.js
    const mcpmonCmd = getMcpmonCommand();
    if (mcpmonCmd.command !== 'mcpmon') {
        console.log(`\n🚀 Using Node.js ${mcpmonCmd.command} to run mcpmon`);
    }
    for (const name of serversToSetup) {
        const serverConfig = config.mcpServers[name];
        // Check if already configured with mcpmon
        if (isAlreadyConfigured(serverConfig)) {
            console.log(`⚠️  Server '${name}' is already configured with mcpmon`);
            console.log(`   Unwrapping and re-configuring...`);
            // Unwrap the existing configuration to get the original
            const original = unwrapMcpmonConfig(serverConfig);
            // Re-wrap with current mcpmon command
            let commandParts;
            // Check if command contains spaces (full command string)
            if (original.command.includes(' ')) {
                const parsed = parseCommandString(original.command);
                // Skip 'mcpmon' if it's the first part (shouldn't be in the original command)
                if (parsed.command === 'mcpmon' && parsed.args.length > 0) {
                    commandParts = parsed.args;
                }
                else {
                    commandParts = [parsed.command, ...parsed.args];
                }
            }
            else {
                commandParts = [original.command];
            }
            // Handle Docker environment variables
            let dockerEnvArgs = [];
            if (commandParts[0] === 'docker' && serverConfig.env) {
                // Convert env vars to docker -e flags
                for (const [key, value] of Object.entries(serverConfig.env)) {
                    dockerEnvArgs.push('-e', `${key}=${value}`);
                }
            }
            // Handle Docker-based servers - add watch targets for local development
            let watchArgs = [];
            if (commandParts[0] === 'docker') {
                // Try to detect local development directory based on image name
                const imageIndex = commandParts.findIndex(arg => arg.includes('ghcr.io/') || arg.includes('/'));
                if (imageIndex !== -1) {
                    const imageName = commandParts[imageIndex];
                    // Special handling for known MCP servers
                    if (imageName.includes('github/github-mcp-server')) {
                        // Check if the local binary exists
                        const localBinary = '/Users/neilopet/go/src/github.com/github/github-mcp-server/github-mcp-server';
                        if (existsSync(localBinary)) {
                            watchArgs = ['--watch', localBinary];
                            console.log(`   Added watch target: ${localBinary}`);
                        }
                    }
                    // Add more special cases as needed
                }
            }
            // Insert docker env args after 'docker run' but before image name
            let finalArgs = [...mcpmonCmd.args, ...watchArgs, ...commandParts];
            if (dockerEnvArgs.length > 0) {
                // Find position after 'run' command
                const runIndex = finalArgs.findIndex(arg => arg === 'run');
                if (runIndex !== -1) {
                    finalArgs.splice(runIndex + 1, 0, ...dockerEnvArgs);
                }
            }
            finalArgs.push(...(original.args || []));
            newConfig.mcpServers[name] = {
                command: mcpmonCmd.command,
                args: finalArgs,
                env: serverConfig.env, // Keep existing env
                cwd: serverConfig.cwd,
            };
        }
        else {
            console.log(`🔧 Configuring '${name}' for hot-reload...`);
            // First-time configuration
            let commandParts;
            // Check if command contains spaces (full command string)
            if (serverConfig.command.includes(' ')) {
                const parsed = parseCommandString(serverConfig.command);
                // Skip 'mcpmon' if it's the first part (shouldn't be in the original command)
                if (parsed.command === 'mcpmon' && parsed.args.length > 0) {
                    commandParts = parsed.args;
                }
                else {
                    commandParts = [parsed.command, ...parsed.args];
                }
            }
            else {
                commandParts = [serverConfig.command];
            }
            // Handle Docker environment variables
            let dockerEnvArgs = [];
            if (commandParts[0] === 'docker' && serverConfig.env) {
                // Convert env vars to docker -e flags
                for (const [key, value] of Object.entries(serverConfig.env)) {
                    dockerEnvArgs.push('-e', `${key}=${value}`);
                }
            }
            // Handle Docker-based servers - add watch targets for local development
            let watchArgs = [];
            if (commandParts[0] === 'docker') {
                // Try to detect local development directory based on image name
                const imageIndex = commandParts.findIndex(arg => arg.includes('ghcr.io/') || arg.includes('/'));
                if (imageIndex !== -1) {
                    const imageName = commandParts[imageIndex];
                    // Special handling for known MCP servers
                    if (imageName.includes('github/github-mcp-server')) {
                        // Check if the local binary exists
                        const localBinary = '/Users/neilopet/go/src/github.com/github/github-mcp-server/github-mcp-server';
                        if (existsSync(localBinary)) {
                            watchArgs = ['--watch', localBinary];
                            console.log(`   Added watch target: ${localBinary}`);
                        }
                    }
                    // Add more special cases as needed
                }
            }
            // Insert docker env args after 'docker run' but before image name
            let finalArgs = [...mcpmonCmd.args, ...watchArgs, ...commandParts];
            if (dockerEnvArgs.length > 0) {
                // Find position after 'run' command
                const runIndex = finalArgs.findIndex(arg => arg === 'run');
                if (runIndex !== -1) {
                    finalArgs.splice(runIndex + 1, 0, ...dockerEnvArgs);
                }
            }
            finalArgs.push(...(serverConfig.args || []));
            newConfig.mcpServers[name] = {
                command: mcpmonCmd.command,
                args: finalArgs,
                env: serverConfig.env,
                cwd: serverConfig.cwd,
            };
        }
        modifiedServers.push(name);
    }
    // Write updated config
    try {
        let configToWrite;
        if (isClaudeCode) {
            // For Claude Code, we need to merge back into the full config
            const configText = readFileSync(configPath, 'utf8');
            const fullConfig = JSON.parse(configText);
            fullConfig.mcpServers = newConfig.mcpServers;
            configToWrite = fullConfig;
        }
        else {
            configToWrite = newConfig;
        }
        const finalConfigText = JSON.stringify(configToWrite, null, 2);
        writeFileSync(configPath, finalConfigText, 'utf8');
        console.log(`\n✅ Updated config file: ${configPath}`);
        console.log(`\n📝 Hot-reload configured for ${serversToSetup.length} server(s):`);
        for (const serverName of serversToSetup) {
            console.log(`   - ${serverName} → mcpmon ${config.mcpServers[serverName].command}`);
        }
        console.log(`\n⚠️  Important: Restart your MCP client (Claude Desktop, etc.) to load the new configuration.`);
    }
    catch (error) {
        console.error(`❌ Failed to write config: ${error.message}`);
        process.exit(1);
    }
    // Show summary
    console.log(`\n🎉 Successfully configured ${modifiedServers.length} server(s) for hot-reload:`);
    modifiedServers.forEach((name) => {
        console.log(`\n   📦 ${name} (now using mcpmon for hot-reload)`);
    });
    console.log(`\n💡 To restore original configuration:`);
    console.log(`   cp "${backupPath}" "${configPath}"`);
    if (configPath.includes('claude_desktop_config.json')) {
        console.log(`\n⚠️  Restart Claude Desktop to apply changes`);
    }
    else if (configPath.includes('.claude.json')) {
        console.log(`\n⚠️  Restart Claude Code to apply changes`);
    }
    else if (configPath.includes('.mcp.json')) {
        console.log(`\n⚠️  Restart Claude Code or reload the project`);
    }
}
/**
 * Restore config from latest backup
 */
function restoreConfig(configPath) {
    // Find latest backup
    const dir = resolve(configPath, '..');
    const baseName = configPath.split('/').pop() || configPath.split('\\').pop() || '';
    const backupPattern = `${baseName}.backup-`;
    const files = readdirSync(dir);
    const backups = files
        .filter((f) => f.startsWith(backupPattern))
        .sort()
        .reverse();
    if (backups.length === 0) {
        console.error(`❌ No backups found for ${configPath}`);
        process.exit(1);
    }
    const latestBackup = join(dir, backups[0]);
    console.log(`📋 Restoring from: ${latestBackup}`);
    try {
        copyFileSync(latestBackup, configPath);
        console.log(`✅ Config restored successfully`);
        console.log(`\n⚠️  Remember to restart Claude to apply changes`);
    }
    catch (error) {
        console.error(`❌ Failed to restore config: ${error.message}`);
        process.exit(1);
    }
}
/**
 * Main setup function (legacy - for backward compatibility)
 */
export function setup(args) {
    // Parse arguments
    let configPath;
    let serverName = null;
    let listMode = false;
    let setupAll = false;
    let restoreMode = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--config' || arg === '-c') {
            configPath = args[++i];
        }
        else if (arg === '--list' || arg === '-l') {
            listMode = true;
        }
        else if (arg === '--all') {
            setupAll = true;
        }
        else if (arg === '--restore') {
            restoreMode = true;
        }
        else if (!arg.startsWith('-')) {
            serverName = arg;
        }
    }
    executeSetup(configPath, serverName, listMode, setupAll, restoreMode);
}
/**
 * Commander.js setup function
 */
export function setupCommand(serverName, options) {
    executeSetup(options.config, serverName || null, options.list || false, options.all || false, options.restore || false);
}
/**
 * Core setup logic (extracted from main setup function)
 */
function executeSetup(configPath, serverName, listMode, setupAll, restoreMode) {
    // Find config file
    const foundConfigPath = findConfigFile(configPath);
    if (!foundConfigPath) {
        console.error(`\n❌ No config file found!`);
        console.error(`\nSearched in:`);
        console.error(`  1. .mcp.json (Claude Code project config)`);
        console.error(`  2. ~/.claude.json (Claude Code user config)`);
        if (platform === 'darwin') {
            console.error(`  3. ~/Library/Application Support/Claude/claude_desktop_config.json`);
        }
        else if (platform === 'win32') {
            console.error(`  3. %APPDATA%\\Claude\\claude_desktop_config.json`);
        }
        else {
            console.error(`  3. ~/.config/Claude/claude_desktop_config.json`);
        }
        console.error(`  4. ./mcpServers.json`);
        console.error(`\nYou can specify a custom path with --config <path>`);
        process.exit(1);
    }
    // Handle restore mode
    if (restoreMode) {
        restoreConfig(foundConfigPath);
        return;
    }
    // Load config
    let config;
    const isClaudeCode = foundConfigPath.endsWith('.claude.json');
    try {
        const configText = readFileSync(foundConfigPath, 'utf8');
        const rawConfig = JSON.parse(configText);
        if (isClaudeCode) {
            // Claude Code stores mcpServers directly in the config
            const claudeConfig = rawConfig;
            config = {
                mcpServers: claudeConfig.mcpServers || {}
            };
        }
        else {
            config = rawConfig;
        }
    }
    catch (error) {
        console.error(`❌ Failed to read config file: ${error.message}`);
        process.exit(1);
    }
    // Validate config structure
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        console.error(`❌ Invalid config format: missing or invalid 'mcpServers' object`);
        console.error(`\nExpected format: { "mcpServers": { "name": { "command": "...", "args": [...] } } }`);
        process.exit(1);
    }
    // Handle list mode
    if (listMode) {
        listServers(config, foundConfigPath);
        return;
    }
    // Handle setup mode
    setupHotReload(config, foundConfigPath, serverName, setupAll, isClaudeCode);
}
