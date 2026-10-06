import { defineConfig } from 'vitest/config';

// Unit tests for src/lib. Vite understands the `?raw` icon imports natively, and
// the lib files only import Astro *types*, so nothing needs to be mocked.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/icons.ts'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
