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
      '@socilab/sdk': source('./packages/sdk/src/index.ts'),
      '@socilab/shared': source('./packages/shared/src/index.ts'),
      '@socilab/shared-ui': source('./packages/shared-ui/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/{client,admin}/**/*.test.{ts,tsx}', 'jsdom'],
    ],
    globalSetup: ['./tests/linter/global-setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    maxWorkers: 4,
  },
})
