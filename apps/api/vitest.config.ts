import { defineConfig } from 'vitest/config';
import { tsDecorators } from './test/ts-decorators-plugin.js';

export default defineConfig({
  plugins: [tsDecorators()],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
