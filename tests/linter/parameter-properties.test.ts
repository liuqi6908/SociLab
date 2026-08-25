import { describe, expect, it } from 'vitest'
import { readParameterPropertyOrderDiagnostics } from './parameter-properties'

/** -------------------- 测试 -------------------- */
describe('参数属性顺序守卫', () => {
  it('报告散落在运行时语句后的同名参数属性声明', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      {
        filePath: 'fixtures/invalid.ts',
        source: [
          'declare function createClient(): unknown',
          'declare function use(value: string): void',
          '',
          'export function late(options: { userId: string }) {',
          '  const client = createClient()',
          '  const userId = options.userId',
          '  return { client, userId }',
          '}',
          '',
          'export const separated = (input: { threadId: string; workspaceId: string }) => {',
          '  const threadId = input.threadId',
          '  use(threadId)',
          '  const workspaceId = input.workspaceId',
          '  return workspaceId',
          '}',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => [item.scope, item.line, item.message])).toEqual([
      ['late', 6, 'userId 来自参数 options，必须在函数体开头声明'],
      ['separated', 13, 'workspaceId 来自参数 input，必须在函数体开头声明'],
    ])
  })

  it('接受首部连续声明以及收窄后的局部属性读取', () => {
    expect(readParameterPropertyOrderDiagnostics([{
      filePath: 'fixtures/valid.ts',
      source: [
        'declare function createClient(): unknown',
        'declare function use(value: string): void',
        '',
        'export function leading(options: { userId: string; workspaceId: string }) {',
        '  const { workspaceId } = options',
        '  const userId = options.userId',
        '  const client = createClient()',
        '  use(workspaceId)',
        '  return { client, userId }',
        '}',
        '',
        'export function narrowed(value: unknown) {',
        `  if (!value || typeof value !== 'object')`,
        '    return',
        `  const type = (value as { type?: string }).type`,
        '  return type',
        '}',
        '',
        'export function optional(input: { payload: unknown } | undefined) {',
        '  if (!input)',
        '    return',
        '  const payload = input.payload',
        '  return payload',
        '}',
        '',
        'type AliasInput = ({ aliasId: string } | undefined)',
        '',
        'export function aliasNarrowed(input: AliasInput) {',
        '  if (!input)',
        '    return',
        '  const aliasId = input.aliasId',
        '  return aliasId',
        '}',
        '',
        'export function genericNarrowed<T extends ({ genericId: string } | undefined)>(',
        '  input: T,',
        ') {',
        '  if (!input)',
        '    return',
        '  const genericId = input.genericId',
        '  return genericId',
        '}',
        '',
        'export function parenthesizedNarrowed(',
        '  input: (({ parenthesizedId: string } | null)),',
        ') {',
        '  if (!input)',
        '    return',
        '  const parenthesizedId = input.parenthesizedId',
        '  return parenthesizedId',
        '}',
      ].join('\n'),
    }])).toEqual([])
  })

  it('按 declarator 顺序在运行时初始化后报告同语句参数属性', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      {
        filePath: 'fixtures/mixed-declarators-invalid.ts',
        source: [
          'declare function createClient(): unknown',
          '',
          'export function runtimeFirst(options: { userId: string }) {',
          '  const client = createClient(), userId = options.userId',
          '  return { client, userId }',
          '}',
          '',
          'export function runtimeMiddle(input: { threadId: string; workspaceId: string }) {',
          '  const threadId = input.threadId, client = createClient(), workspaceId = input.workspaceId',
          '  return { client, threadId, workspaceId }',
          '}',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => [item.scope, item.message])).toEqual([
      ['runtimeFirst', 'userId 来自参数 options，必须在函数体开头声明'],
      ['runtimeMiddle', 'workspaceId 来自参数 input，必须在函数体开头声明'],
    ])
  })

  it('检查全部函数实现形态与 contextual 参数', () => {
    const diagnostics = readParameterPropertyOrderDiagnostics([
      {
        filePath: 'fixtures/function-kinds-invalid.ts',
        source: [
          'declare function run(): void',
          '',
          'class Service {',
          '  constructor(options: { constructorId: string }) {',
          '    run()',
          '    const constructorId = options.constructorId',
          '  }',
          '',
          '  methodValue(input: { methodId: string }) {',
          '    run()',
          '    const methodId = input.methodId',
          '    return methodId',
          '  }',
          '',
          '  get getterValue(input: { getterId: string }) {',
          '    run()',
          '    const getterId = input.getterId',
          '    return getterId',
          '  }',
          '',
          '  set setterValue(input: { setterId: string }) {',
          '    run()',
          '    const setterId = input.setterId',
          '  }',
          '}',
          '',
          'export const expression = function (options: { expressionId: string }) {',
          '  run()',
          '  const expressionId = options.expressionId',
          '  return expressionId',
          '}',
          '',
          'type ContextualHandler = (input: { contextualId: string }) => string',
          '',
          'export const contextual: ContextualHandler = (input) => {',
          '  run()',
          '  const contextualId = input.contextualId',
          '  return contextualId',
          '}',
          '',
          'export { Service }',
        ].join('\n'),
      },
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
      {
        filePath: 'fixtures/semantic-narrowing-invalid.ts',
        source: [
          'declare function run(): void',
          '',
          'export function unknownUnsafe(value: unknown) {',
          '  run()',
          `  const payload = (value as { payload: string }).payload`,
          '  return payload',
          '}',
          '',
          'export function anyUnsafe(input: any) {',
          '  run()',
          '  const anyId = input.anyId',
          '  return anyId',
          '}',
          '',
          'export function nullableUnsafe(input: { nullableId: string } | undefined) {',
          '  run()',
          '  const nullableId = input?.nullableId',
          '  return nullableId',
          '}',
        ].join('\n'),
      },
    ])

    expect(diagnostics.map(item => [item.scope, item.message])).toEqual([
      ['unknownUnsafe', 'payload 来自参数 value，必须在函数体开头声明'],
      ['anyUnsafe', 'anyId 来自参数 input，必须在函数体开头声明'],
      ['nullableUnsafe', 'nullableId 来自参数 input，必须在函数体开头声明'],
    ])
  })
})
