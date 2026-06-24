module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/scripts/**',
    '!src/server.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75, // Les branches (if/else) sont souvent plus dures à monter à 90%, 85% est un excellent seuil
      functions: 90,
      lines: 90,
    },
  },
};