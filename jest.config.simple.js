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
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!.*\\.mjs$)"
  ],
  testMatch: [
    "**/tests/behavior/**/*.test.ts",
    "**/tests/integration/**/*.test.ts",
    "**/tests/extensions/**/*.test.ts",
    "**/src/**/*.test.ts"
  ],
  testEnvironment: "node",
  testTimeout: 60000,
};