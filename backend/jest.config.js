// backend/jest.config.js
'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'api/**/*.js',
    '!**/node_modules/**',
  ],
};