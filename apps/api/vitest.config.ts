import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Database specs share one schema per dialect, so spec files run one after another.
    fileParallelism: false,
  },
});
