/**
 * Global test setup for Large Response Handler tests
 */

const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');

module.exports = async () => {
  // Create test directories
  const testDir = join(process.cwd(), '.test-temp', 'lrh');
  
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch (error) {
    // Directory might not exist, ignore
  }
  
  mkdirSync(testDir, { recursive: true });
  
  // Set environment variables for testing
  process.env.MCPMON_TEST_DATA_DIR = testDir;
  process.env.NODE_ENV = 'test';
  
  console.log('LRH test environment setup complete');
};