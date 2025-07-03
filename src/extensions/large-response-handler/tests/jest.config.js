/**
 * Jest configuration for Large Response Handler Extension tests
 * 
 * This configuration allows running LRH tests independently or as part
 * of the larger test suite.
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Large Response Handler Extension',
  
  // Test files to include
  testMatch: [
    '<rootDir>/**/*.test.ts',
    '<rootDir>/index.ts' // Include DI-based tests
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/register.ts'
  ],
  
  // Module resolution
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }]
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    '../*.ts',
    '!../*.d.ts',
    '!../tests/**'
  ],
  
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html'
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Enable ES modules
  extensionsToTreatAsEsm: ['.ts'],
  
  // Global setup/teardown
  globalSetup: '<rootDir>/setup.js',
  globalTeardown: '<rootDir>/teardown.js'
};