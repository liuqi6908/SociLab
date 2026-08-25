import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readParameterPropertyOrderDiagnostics } from './parameter-properties'

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/parameter-properties')

/**
 * 读取参数属性顺序夹具
 */
function fixture(name: string) {
  return {
    filePath: `fixtures/${name}.ts`,
    source: readFileSync(path.join(fixtureRoot, `${name}.fixture`), 'utf8'),
  }
}

/** -------------------- 测试 -------------------- */
describe('参数属性顺序守卫', () => {
  it('报告散落在运行时语句后的同名参数属性声明', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      fixture('invalid'),
    ])

    expect(diagnostics.map(item => [item.scope, item.line, item.message])).toEqual([
      ['late', 6, 'userId 来自参数 options，必须在函数体开头声明'],
      ['separated', 13, 'workspaceId 来自参数 input，必须在函数体开头声明'],
    ])
  })

  it('接受首部连续声明以及收窄后的局部属性读取', () => {
    expect(readParameterPropertyOrderDiagnostics([fixture('valid')])).toEqual([])
  })
})
