import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNamedImportExportLayoutDiagnostics } from './named-import-export-layout'

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(
  import.meta.dirname,
  'fixtures/named-import-export-layout',
)

/**
 * 读取命名导入与导出布局夹具
 */
function fixture(name: string) {
  return {
    filePath: `fixtures/${name}.ts`,
    source: readFileSync(path.join(fixtureRoot, `${name}.fixture`), 'utf8'),
  }
}

/** -------------------- 测试 -------------------- */
describe('命名导入与导出布局守卫', () => {
  it('报告应收成单行的 import 与应拆成多行的 export', () => {
    const diagnostics = readNamedImportExportLayoutDiagnostics([
      fixture('invalid'),
    ])

    expect(diagnostics).toEqual([
      {
        column: 1,
        filePath: 'fixtures/invalid.ts',
        kind: 'import',
        line: 1,
        memberCount: 2,
        singleLineLength: 42,
      },
      {
        column: 1,
        filePath: 'fixtures/invalid.ts',
        kind: 'export',
        line: 5,
        memberCount: 1,
        singleLineLength: 121,
      },
    ])
  })

  it('接受 120 字符单行与 121 字符多行声明', () => {
    expect(readNamedImportExportLayoutDiagnostics([fixture('valid')])).toEqual([])
  })
})
