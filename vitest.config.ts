import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Source is authored as NodeNext ESM, so relative imports carry explicit
 * `.js` extensions (required for `node dist/cli.js` at runtime). Vitest runs
 * the TypeScript sources directly, so this tiny resolver maps a `./foo.js`
 * specifier back to the real `./foo.ts` on disk. It only ever touches relative
 * specifiers that actually have a `.ts` sibling; everything else falls through
 * to Vite's default resolution untouched.
 */
export const resolveTsFromJs: Plugin = {
  name: 'gibwork-verity:resolve-ts-from-js',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (importer && source.startsWith('.') && source.endsWith('.js')) {
      const asTs = source.slice(0, -3) + '.ts';
      const resolved = await this.resolve(asTs, importer, { skipSelf: true });
      if (resolved) return resolved;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [resolveTsFromJs],
  test: {
    include: ['tests/**/*.test.ts'],
    // The live SDK integration test is opt-in only (npm run test:live).
    exclude: ['tests/**/*.live.ts', 'node_modules/**', 'dist/**'],
    environment: 'node',
    reporters: ['default'],
  },
});
