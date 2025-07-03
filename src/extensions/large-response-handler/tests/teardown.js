/**
 * Global test teardown for Large Response Handler tests
 */

const { rmSync } = require('fs');
const { join } = require('path');

module.exports = async () => {
  // Clean up test directories
  const testDir = join(process.cwd(), '.test-temp', 'lrh');
  
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to clean up test directory:', error.message);
  }
  
  // Clean up environment variables
  delete process.env.MCPMON_TEST_DATA_DIR;
  
  console.log('LRH test environment cleanup complete');
};