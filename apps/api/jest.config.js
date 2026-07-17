/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  // Also discover operational-tooling tests under apps/api/scripts (kept out of the app
  // build so remediation code never ships in dist). See scripts/remediation/**.
  roots: ['<rootDir>', '<rootDir>/../scripts'],
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
