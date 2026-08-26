import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** -------------------- 配置 -------------------- */
const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** -------------------- 配置出口 -------------------- */
export default defineConfig({
  resolve: {
    alias: {
      '@socilab/api': source('./packages/api/src/index.ts'),
      '@socilab/request': source('./packages/request/src/index.ts'),
      '@socilab/sdk/query': source('./packages/sdk/src/query/index.ts'),
      '@socilab/sdk': source('./packages/sdk/src/index.ts'),
      '@socilab/shared': source('./packages/shared/src/index.ts'),
      '@socilab/shared-ui/utils': source('./packages/shared-ui/src/utils/index.ts'),
    },
  },
  test: {
    globalSetup: ['./tests/linter/global-setup.ts'],
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          exclude: ['tests/{client,admin}/**/*.test.{ts,tsx}'],
          include: ['tests/**/*.test.{ts,tsx}'],
          name: 'node',
        },
      },
      {
        extends: true,
        test: {
          environment: 'jsdom',
          include: ['tests/{client,admin}/**/*.test.{ts,tsx}'],
          name: 'web',
        },
      },
    ],
  },
})
