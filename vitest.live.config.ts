import { defineConfig } from 'vitest/config';
import { resolveTsFromJs } from './vitest.config.js';

/**
 * Opt-in live SDK integration test. Hits the REAL Gibwork API (read-only) and
 * is never part of `npm test` or CI. Run explicitly with `npm run test:live`.
 */
export default defineConfig({
  plugins: [resolveTsFromJs],
  test: {
    include: ['tests/**/*.live.ts'],
    environment: 'node',
    reporters: ['default'],
    testTimeout: 30_000,
  },
});
