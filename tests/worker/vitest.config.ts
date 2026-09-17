import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/worker/**/*.test.ts'],
    exclude: ['tests/worker/runtime.test.ts'],
    environment: 'node',
  },
});
