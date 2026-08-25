import { describe, expect, it } from 'vitest'
import { readDeprecatedApiDiagnostics } from './deprecated-api'

/** -------------------- 测试 -------------------- */
describe('废弃 API 守卫', () => {
  it('只报告 Language Service suggestions 中的废弃 API 调用', () => {
    const diagnostics = readDeprecatedApiDiagnostics([{
      filePath: 'fixtures/invalid.ts',
      source: [
        '/** @deprecated 请改用 current */',
        'declare function legacy(): void',
        'declare function current(): void',
        '',
        'legacy()',
        'current()',
      ].join('\n'),
    }])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      column: 1,
      filePath: 'fixtures/invalid.ts',
      line: 5,
    })
    expect(diagnostics[0]?.message).toContain('legacy')
    expect(diagnostics[0]?.message).toContain('deprecated')
  })

  it('接受未调用废弃声明的源码', () => {
    expect(readDeprecatedApiDiagnostics([{
      filePath: 'fixtures/valid.ts',
      source: [
        '/** @deprecated 请改用 current */',
        'declare function legacy(): void',
        'declare function current(): void',
        '',
        'current()',
      ].join('\n'),
    }])).toEqual([])
  })

  it('支持物理不存在目录中的跨文件相对导入', () => {
    const diagnostics = readDeprecatedApiDiagnostics([
      {
        filePath: 'fixtures/shared/legacy.ts',
        source: [
          '/** @deprecated 请改用 current */',
          'export function legacy(): void {}',
        ].join('\n'),
      },
      {
        filePath: 'fixtures/feature/consumer.ts',
        source: [
          `import { legacy } from '../shared/legacy'`,
          '',
          'legacy()',
        ].join('\n'),
      },
    ])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        column: 1,
        filePath: 'fixtures/feature/consumer.ts',
        line: 3,
      }),
    ]))
  })
})
