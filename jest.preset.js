const { workspaceRoot } = require('@nx/devkit');
const path = require('path');

module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@postgres-web-manager/contracts$': path.join(
      workspaceRoot,
      'libs/contracts/src/index.ts',
    ),
  },
};
