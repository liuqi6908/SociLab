import { describe, expect, it } from 'vitest'
import { readNamedImportExportLayoutDiagnostics } from './named-import-export-layout'

/** -------------------- 测试 -------------------- */
describe('命名导入与导出布局守卫', () => {
  it('报告应收成单行的 import 与应拆成多行的 export', async () => {
    const importStatement = buildSingleLineImport(42)
    const exportStatement = buildSingleLineExport(121, 'BoundaryExport')
    const diagnostics = await readNamedImportExportLayoutDiagnostics([
      {
        filePath: 'fixtures/invalid.ts',
        source: [
          toMultilineImport(importStatement, ['alpha', 'beta']),
          exportStatement,
        ].join('\n'),
      },
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

  it('接受 120 字符单行与 121 字符多行声明', async () => {
    const inlineBoundary = buildSingleLineImport(120, ['AlphaValue', 'BetaValue'])
    const multilineBoundary = toMultilineExport(
      buildSingleLineExport(121, 'BoundaryExport'),
      ['BoundaryExport'],
    )

    expect(await readNamedImportExportLayoutDiagnostics([{
      filePath: 'fixtures/valid.ts',
      source: [
        inlineBoundary,
        '',
        multilineBoundary,
      ].join('\n'),
    }])).toEqual([])
  })

  it('按移除尾逗号后的 120 字符折叠多成员 export', async () => {
    const exportStatement = buildSingleLineExport(
      120,
      ['alphaMember', 'betaMember', 'gammaMember', 'deltaMember'],
    )
    expect(await readNamedImportExportLayoutDiagnostics([
      {
        filePath: 'fixtures/trailing-comma-boundary.ts',
        source: toMultilineExport(
          exportStatement,
          ['alphaMember', 'betaMember', 'gammaMember', 'deltaMember'],
          true,
        ),
      },
    ])).toEqual([
      {
        column: 1,
        filePath: 'fixtures/trailing-comma-boundary.ts',
        kind: 'export',
        line: 1,
        memberCount: 4,
        singleLineLength: 120,
      },
    ])
  })
})

/** -------------------- 内部函数 -------------------- */
function buildSingleLineImport(targetLength: number, members = ['alpha', 'beta']) {
  const memberText = members.join(', ')
  const prefix = `import { ${memberText} } from './`
  const suffix = `'`

  return `${prefix}${'x'.repeat(targetLength - prefix.length - suffix.length)}${suffix}`
}

function buildSingleLineExport(
  targetLength: number,
  members: string | readonly string[],
) {
  const memberText = Array.isArray(members) ? members.join(', ') : members
  const prefix = `export { ${memberText} } from './`
  const suffix = `'`

  return `${prefix}${'x'.repeat(targetLength - prefix.length - suffix.length)}${suffix}`
}

function toMultilineExport(
  singleLineStatement: string,
  members: readonly string[],
  trailingComma = false,
) {
  const moduleSpecifier = singleLineStatement.match(/from ('[^']+')$/)?.[1]

  if (!moduleSpecifier)
    throw new Error(`无法读取导出模块说明符：${singleLineStatement}`)

  const lines = [
    'export {',
    ...members.map(member => `  ${member}${trailingComma ? ',' : ''}`),
    trailingComma ? '}' : '}',
    `from ${moduleSpecifier}`,
  ]

  if (!trailingComma)
    lines[lines.length - 2] = `  ${members.at(-1)!}`

  return [
    'export {',
    ...members.map((member, index) => (
      `  ${member}${trailingComma || index < members.length - 1 ? ',' : ''}`
    )),
    `} from ${moduleSpecifier}`,
  ].join('\n')
}

function toMultilineImport(
  singleLineStatement: string,
  members: readonly string[],
) {
  const moduleSpecifier = singleLineStatement.match(/from ('[^']+')$/)?.[1]

  if (!moduleSpecifier)
    throw new Error(`无法读取导入模块说明符：${singleLineStatement}`)

  return [
    'import {',
    ...members.map((member, index) => (
      `  ${member}${index < members.length - 1 ? ',' : ''}`
    )),
    `} from ${moduleSpecifier}`,
  ].join('\n')
}
