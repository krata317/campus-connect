import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Keep every artefact inside the workspace so the suite does not depend on
    // a writable OS temp directory.
    cacheDir: './node_modules/.vite-test',
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      css: false,
      restoreMocks: true,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  }),
);
