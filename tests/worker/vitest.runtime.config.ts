import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/worker/runtime.test.ts'], environment: 'node' },
});
