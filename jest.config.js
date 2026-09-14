const nextJest = require('next/jest')

// Pin legacy date utilities and API fixtures. Ranking windows use UTC bucket
// boundaries and the scorer compares exact timestamps.
process.env.TZ = 'UTC'

// next/jest wires up the SWC transform, tsconfig `paths`, and CSS/asset stubs.
// This replaces the hand-rolled babel-jest setup, which broke on the Next 16
// upgrade because it depended on `next/babel` pulling in @babel/runtime.
const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  clearMocks: true,
  coverageDirectory: 'coverage',
  setupFiles: ['dotenv/config', '<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  // The isolated trading environment includes duplicate Jupyter package names;
  // neither those packages nor downloaded caches are application modules.
  modulePathIgnorePatterns: ['<rootDir>/.cache/'],
  // quick-lru is ESM-only (S3Store reaches it via `await import`). node_modules
  // is not transformed by default, so Jest chokes on its `export` statement —
  // allow this one package through the transform.
  transformIgnorePatterns: [
    '/node_modules/(?!(quick-lru)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

module.exports = createJestConfig(config)
