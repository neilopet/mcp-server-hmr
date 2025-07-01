export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
    }]
  },
  testMatch: [
    '**/src/**/*.test.ts',
    '**/src/**/*.spec.ts',
    '**/tests/behavior/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  passWithNoTests: true
};