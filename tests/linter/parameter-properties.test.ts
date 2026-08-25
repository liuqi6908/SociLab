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

  it('按 declarator 顺序在运行时初始化后报告同语句参数属性', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      fixture('mixed-declarators-invalid'),
    ])

    expect(diagnostics.map(item => [item.scope, item.message])).toEqual([
      ['runtimeFirst', 'userId 来自参数 options，必须在函数体开头声明'],
      ['runtimeMiddle', 'workspaceId 来自参数 input，必须在函数体开头声明'],
    ])
  })

  it('检查全部函数实现形态与 contextual 参数', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      fixture('function-kinds-invalid'),
    ])

    expect(diagnostics.map(item => [item.scope, item.message])).toEqual([
      ['constructor', 'constructorId 来自参数 options，必须在函数体开头声明'],
      ['methodValue', 'methodId 来自参数 input，必须在函数体开头声明'],
      ['getterValue', 'getterId 来自参数 input，必须在函数体开头声明'],
      ['setterValue', 'setterId 来自参数 input，必须在函数体开头声明'],
      ['expression', 'expressionId 来自参数 options，必须在函数体开头声明'],
      ['contextual', 'contextualId 来自参数 input，必须在函数体开头声明'],
    ])
  })

  it('报告 unknown、any 与 nullable 参数未经收窄的属性读取', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      fixture('semantic-narrowing-invalid'),
    ])

    expect(diagnostics.map(item => [item.scope, item.message])).toEqual([
      ['unknownUnsafe', 'payload 来自参数 value，必须在函数体开头声明'],
      ['anyUnsafe', 'anyId 来自参数 input，必须在函数体开头声明'],
      ['nullableUnsafe', 'nullableId 来自参数 input，必须在函数体开头声明'],
    ])
  })
})
