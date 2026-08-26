import { describe, expect, it } from 'vitest'
import { readPrivateMemberDiagnostics } from './private-members'

/** -------------------- 测试 -------------------- */
describe('private 成员守卫', () => {
  it('捕获字段、方法与构造器 parameter property 的非下划线名称', async () => {
    const diagnostics = await readPrivateMemberDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'export class InvalidService {',
          '  private value = 1',
          '',
          '  public constructor(private readonly dependency: string) {}',
          '',
          '  private read() {',
          '    return this.value + this.dependency.length',
          '  }',
          '}',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => item.name)).toEqual([
      'value',
      'dependency',
      'read',
    ])
    expect(diagnostics.map(item => [item.line, item.column])).toEqual([
      [2, 11],
      [4, 39],
      [6, 11],
    ])
  })

  it('接受下划线 private 成员和构造器 parameter property', async () => {
    expect(await readPrivateMemberDiagnostics([
      {
        filePath: 'fixture.ts',
        source: [
          'export class ValidService {',
          '  public constructor(private readonly _dependency: string) {}',
          '',
          '  private _read() {',
          '    return this._dependency',
          '  }',
          '',
          '  public execute() {',
          '    return this._read()',
          '  }',
          '}',
        ].join('\n'),
      },
    ])).toEqual([])
  })
})
