const { readFileSync } = require('fs');
const { resolve } = require('path');

const swcJestConfig = JSON.parse(
  readFileSync(resolve(__dirname, '.spec.swcrc'), 'utf-8'),
);
swcJestConfig.swcrc = false;

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  displayName: '@org/api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../test-output/api/jest/coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@postgres-web-manager/contracts$':
      '<rootDir>/../../libs/contracts/src/index.ts',
    // Remap .js extensions to .ts for TypeScript source files during testing
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
};
