import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'node:path';

// Mirror Next.js: load .env.local so SUPABASE_SERVICE_ROLE_KEY and the
// public Supabase keys are available in tests without committing them.
const env = loadEnv('', process.cwd(), '');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    // RLS tests hit a real DB and create/delete fixtures — keep them serial
    // so concurrent runs don't fight over the same __rlstest_* rows.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
