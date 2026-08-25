import { describe, expect, it } from 'vitest'
import { formatModuleDirectoryLayoutDiagnostics, readModuleDirectoryLayoutDiagnostics } from './module-directory-layout'

/** -------------------- 测试 -------------------- */
describe('模块目录布局守卫', () => {
  it('区分应拍平的单文件子目录与缺少并列职责的多文件子目录', () => {
    const diagnostics = readModuleDirectoryLayoutDiagnostics([
      { filePath: 'packages/compact/src/index.ts', source: '' },
      { filePath: 'packages/compact/src/tool/index.tsx', source: '' },
      { filePath: 'packages/skill/src/settings/index.ts', source: '' },
      { filePath: 'packages/skill/src/settings/item/index.tsx', source: '' },
      { filePath: 'packages/skill/src/settings/item/props.ts', source: '' },
    ])

    expect(diagnostics).toEqual([
      {
        childFileCount: 1,
        childPath: 'packages/compact/src/tool',
        directoryPath: 'packages/compact/src',
        kind: 'flatten',
      },
      {
        childFileCount: 2,
        childPath: 'packages/skill/src/settings/item',
        directoryPath: 'packages/skill/src/settings',
        kind: 'split',
      },
    ])
    expect(formatModuleDirectoryLayoutDiagnostics(diagnostics)).toContain('应拍平')
    expect(formatModuleDirectoryLayoutDiagnostics(diagnostics)).toContain('第二个并列模块')
  })

  it('接受拍平、多并列模块、唯一 meta 模块骨架与 TanStack routes', () => {
    expect(readModuleDirectoryLayoutDiagnostics([
      { filePath: 'packages/example/src/index.ts', source: '' },
      { filePath: 'packages/example/src/tool.tsx', source: '' },
      { filePath: 'packages/example/src/sender/index.tsx', source: '' },
      { filePath: 'packages/example/src/feature/index.tsx', source: '' },
      { filePath: 'projects/server/src/index.ts', source: '' },
      { filePath: 'projects/server/src/app/index.ts', source: '' },
      { filePath: 'projects/server/src/infra/index.ts', source: '' },
      { filePath: 'projects/server/src/modules/index.ts', source: '' },
      { filePath: 'projects/server/src/modules/meta/index.ts', source: '' },
      { filePath: 'projects/client/src/main.tsx', source: '' },
      { filePath: 'projects/client/src/routes/index.tsx', source: '' },
      { filePath: 'projects/client/src/routes/detail/index.tsx', source: '' },
    ])).toEqual([])
  })
})
