/**
 * Utility functions for CLI parsing
 * Separated from cli.ts to enable unit testing without side effects
 */
/**
 * Parse command line arguments to extract --watch flags and separate command/args
 * Supports multiple --watch flags and preserves all other arguments
 *
 * @param args Raw command line arguments (e.g., from process.argv.slice(2))
 * @returns Object with watchTargets array, command string, and commandArgs array
 */
export declare function parseWatchAndCommand(args: string[]): {
    watchTargets: string[];
    command: string;
    commandArgs: string[];
};
//# sourceMappingURL=cli-utils.d.ts.map