// Fixed Jest config to use ts-jest properly instead of babel-jest
export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          target: "ES2022",
          module: "ESNext", 
          moduleResolution: "Node",
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          downlevelIteration: true, // Fix for Map iterator issue
        },
      },
    ],
  },
  testMatch: [
    "**/tests/behavior/**/*.test.ts",
    "**/tests/integration/**/*.test.ts",
    "**/tests/extensions/**/*.test.ts",
    "**/src/**/*.test.ts"
  ],
  testEnvironment: "node",
  testTimeout: 60000,
  verbose: true,
  passWithNoTests: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    "src/**/*.ts", 
    "!src/**/*.test.ts", 
    "!src/**/*.spec.ts", 
    "!src/**/*.d.ts"
  ],
  coverageDirectory: "coverage",
};