import { describe, expect, test } from 'vitest'
import { readInterfaceCommentDiagnostics } from './interface-comments'

/** -------------------- 测试 -------------------- */
describe('公共 Interface JSDoc 守卫', () => {
  test('捕获导出 Interface 声明与成员缺失的 JSDoc', async () => {
    const diagnostics = await readInterfaceCommentDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'export interface MissingDocumentation {',
          '  value: string',
          '}',
          '/** 已注释 Interface */',
          'export interface MissingMemberDocumentation {',
          '',
          '  value: string',
          '}',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => `${item.interfaceName}:${item.target}`)).toEqual([
      'MissingDocumentation:interface',
      'MissingDocumentation:value',
      'MissingMemberDocumentation:value',
    ])
    expect(diagnostics.map(item => [item.line, item.column])).toEqual([
      [1, 1],
      [2, 3],
      [7, 3],
    ])
  })

  test('接受完整公共 JSDoc 且不要求内部 Interface', async () => {
    expect(await readInterfaceCommentDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'interface InternalOnly {',
          '  value: string',
          '}',
          '',
          '/** 完整 Interface */',
          'export interface Exported {',
          '  /** 属性成员 */',
          '  value: string',
          '  /** 方法成员 */',
          '  execute(): void',
          '}',
        ].join('\n'),
      },
    ])).toEqual([])
  })

  test('检查本文件命名导出和别名导出的本地 Interface', async () => {
    const diagnostics = await readInterfaceCommentDiagnostics([
      {
        filePath: 'indirect-invalid.ts',
        source: [
          'interface Input {',
          '  value: string',
          '}',
          '',
          'interface AliasInput {',
          '  count: number',
          '}',
          '',
          'export { Input, AliasInput as SharedAliasInput }',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => `${item.interfaceName}:${item.target}`)).toEqual([
      'Input:interface',
      'Input:value',
      'AliasInput:interface',
      'AliasInput:count',
    ])
    expect(await readInterfaceCommentDiagnostics([
      {
        filePath: 'indirect-valid.ts',
        source: [
          '/** 输入 */',
          'interface Input {',
          '  /** 值 */',
          '  value: string',
          '}',
          '',
          '/** 别名输入 */',
          'interface AliasInput {',
          '  /** 数量 */',
          '  count: number',
          '}',
          '',
          'export { Input, AliasInput as SharedAliasInput }',
        ].join('\n'),
      },
    ])).toEqual([])
  })
})
