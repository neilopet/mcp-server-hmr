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
export function parseWatchAndCommand(args: string[]): {
  watchTargets: string[];
  command: string;
  commandArgs: string[];
} {
  const watchTargets: string[] = [];
  let commandStart = -1;
  
  // Known flags that take values (this helps us skip their values)
  const flagsWithValues = new Set([
    '--delay', '--enable-extension', '--disable-extension', 
    '--extensions-data-dir', '--extension-config'
  ]);
  
  // Find watch targets and command start position
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--watch') {
      // Next argument should be the watch target
      if (i + 1 < args.length) {
        watchTargets.push(args[i + 1]);
        i++; // Skip the watch target argument
      } else {
        throw new Error('--watch flag requires a path argument');
      }
    } else if (arg.startsWith('-')) {
      // This is a flag - check if it takes a value
      if (flagsWithValues.has(arg) && i + 1 < args.length) {
        // Skip the next argument as it's the flag's value
        i++;
      }
      // Continue looking for the command
    } else {
      // First non-flag argument is the command
      commandStart = i;
      break;
    }
  }
  
  // Extract command and arguments
  if (commandStart === -1) {
    if (watchTargets.length > 0) {
      throw new Error('Command is required when using --watch flags');
    }
    // No command found, return empty structure
    return {
      watchTargets: [],
      command: '',
      commandArgs: []
    };
  }
  
  const command = args[commandStart];
  const commandArgs = args.slice(commandStart + 1);
  
  return {
    watchTargets,
    command,
    commandArgs
  };
}