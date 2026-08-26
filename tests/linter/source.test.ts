import { expect, it } from 'vitest'
import { parseTypeScriptSources } from './source'

/** -------------------- 测试 -------------------- */
it('通过 TypeScript 7 异步 Program 解析虚拟源码', async () => {
  const parsing = parseTypeScriptSources([
    {
      filePath: 'packages/example/src/index.ts',
      source: 'export const value = 1\n',
    },
  ])

  await expect(parsing).resolves.toMatchObject([
    {
      filePath: 'packages/example/src/index.ts',
      sourceFile: {
        fileName: expect.stringMatching(/packages\/example\/src\/index\.ts$/),
      },
    },
  ])
})
