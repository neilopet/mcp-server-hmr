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
          // Note: We use ESNext/Node instead of NodeNext/NodeNext here because:
          // 1. ts-jest doesn't fully support NodeNext module resolution
          // 2. Jest's ESM support has limitations with import.meta.url
          // 3. This combination works for tests while maintaining ESM compatibility
          // The source code uses NodeNext/NodeNext for proper Node.js ESM support
        },
      },
    ],
  },
  testMatch: [
    "**/src/**/*.test.ts",
    "**/src/**/*.spec.ts",
    "**/tests/behavior/**/*.test.ts",
    "**/tests/integration/**/*.test.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  testEnvironment: "node",
  testTimeout: 30000,
  verbose: true,
  passWithNoTests: true,
};
