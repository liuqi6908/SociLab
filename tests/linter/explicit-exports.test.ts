import { describe, expect, it } from 'vitest'
import { readExplicitExportDiagnostics } from './explicit-exports'

/** -------------------- 测试 -------------------- */
describe('显式导出守卫', () => {
  it('捕获源码 default export、星号导出与缺少命名导出的模块', () => {
    const diagnostics = readExplicitExportDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'const hidden = 1',
          '',
          'export default hidden',
          `export * from './other'`,
          'export { hidden as default }',
        ].join('\n'),
      },
      {
        filePath: 'unexported.ts',
        source: [
          'const hidden = 1',
          '',
          'void hidden',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => `${item.filePath}:${item.kind}`)).toEqual([
      'fixture.ts:default-export',
      'fixture.ts:wildcard-export',
      'fixture.ts:default-export',
      'fixture.ts:missing-named-export',
      'unexported.ts:missing-named-export',
    ])
    expect(diagnostics.slice(0, 3).map(item => [item.line, item.column])).toEqual([
      [3, 1],
      [4, 1],
      [5, 1],
    ])
  })

  it('接受命名导出以及无需导出的应用入口', () => {
    expect(readExplicitExportDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'const value = 1',
          '',
          'export { value }',
          `export type { Value } from './types'`,
        ].join('\n'),
      },
      {
        filePath: 'projects/client/src/main.tsx',
        source: [
          `import { createRoot } from 'react-dom/client'`,
          '',
          `const root = document.querySelector('#root')`,
          '',
          'if (root)',
          '  createRoot(root).render(null)',
        ].join('\n'),
      },
      {
        filePath: 'projects/server/src/main.ts',
        source: 'void 0',
      },
      {
        filePath: 'projects/client/src/vite-env.d.ts',
        source: '/// <reference types="vite/client" />',
      },
    ])).toEqual([])
  })
})
