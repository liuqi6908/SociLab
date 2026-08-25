import { expect, it } from 'vitest'
import {
  MAX_TEST_FILE_LINES,
  assertTestStructure,
  formatTestStructureDiagnostics,
  readTestStructureDiagnostics,
} from './test-structure'

/** -------------------- 常量 -------------------- */
const templateDomainInterpolation = '${' + 'domain}'

/** -------------------- 测试 -------------------- */
it('捕获超过 2000 行的测试文件与跨领域相对导入', () => {
  const diagnostics = readTestStructureDiagnostics([
    {
      filePath: 'tests/client/large.test.ts',
      source: Array.from({ length: MAX_TEST_FILE_LINES + 1 }).fill('test()').join('\n'),
    },
    {
      filePath: 'tests/client/cross-domain.test.ts',
      source: [
        'import { fixture } from \'../protocol/support\'',
        '',
        'export { fixture }',
      ].join('\n'),
    },
  ])

  expect(diagnostics).toEqual([
    {
      filePath: 'tests/client/cross-domain.test.ts',
      kind: 'cross-domain-import',
      targetDomain: 'protocol',
    },
    {
      filePath: 'tests/client/large.test.ts',
      kind: 'file-too-large',
      lineCount: 2_001,
    },
  ])
})

it('捕获动态、类型、import equals 与 CommonJS 跨领域导入', () => {
  const diagnostics = readTestStructureDiagnostics([{
    filePath: 'tests/client/module-forms.test.ts',
    source: [
      'import LegacyServer = require(\'../server/legacy\')',
      '',
      'type RequestValue = import(\'../request/types\').RequestValue',
      '',
      'const protocolModule = import(\'../protocol/dynamic\')',
      'const sharedModule = require(\'../shared/common\')',
      '',
      'export { LegacyServer, protocolModule, sharedModule }',
      'export type { RequestValue }',
    ].join('\n'),
  }])

  expect(diagnostics.map(item => (
    item.kind === 'cross-domain-import' ? item.targetDomain : item.kind
  ))).toEqual(['protocol', 'request', 'server', 'shared'])
})

it('捕获无替换模板动态导入且不猜测表达式模板', () => {
  const diagnostics = readTestStructureDiagnostics([{
    filePath: 'tests/client/template-module-forms.test.ts',
    source: [
      'const protocolModule = import(`../protocol/template`)',
      'const sharedModule = require(`../shared/template`)',
      'const domain = \'server\'',
      `const unknownModule = import(\`../${templateDomainInterpolation}/template\`)`,
      `const unknownCommonJsModule = require(\`../${templateDomainInterpolation}/template\`)`,
      '',
      'export {',
      '  protocolModule,',
      '  sharedModule,',
      '  unknownCommonJsModule,',
      '  unknownModule,',
      '}',
    ].join('\n'),
  }])

  expect(diagnostics.map(item => (
    item.kind === 'cross-domain-import' ? item.targetDomain : item.kind
  ))).toEqual(['protocol', 'shared'])
})

it('接受 2000 行测试与同领域、support 和生产源码相对导入', () => {
  expect(readTestStructureDiagnostics([
    {
      filePath: 'tests/client/limit.test.ts',
      source: Array.from({ length: MAX_TEST_FILE_LINES }).fill('test()').join('\n'),
    },
    {
      filePath: 'tests/client/imports.test.ts',
      source: [
        'import { local } from \'./support\'',
        'import { shared } from \'../support/request\'',
        'import { request } from \'../../packages/request/src\'',
        '',
        'export { local, request, shared }',
      ].join('\n'),
    },
    {
      filePath: 'tests/client/module-forms-valid.test.ts',
      source: [
        'import LocalModule = require(\'./local\')',
        '',
        'type SupportValue = import(\'../support/types\').SupportValue',
        '',
        'const supportModule = import(\'../support/dynamic\')',
        'const productionModule = require(\'../../packages/shared/src\')',
        '',
        'export { LocalModule, productionModule, supportModule }',
        'export type { SupportValue }',
      ].join('\n'),
    },
  ])).toEqual([])
})

it('按文本行语义统计以换行结尾的 2000/2001 行测试', () => {
  expect(readTestStructureDiagnostics([
    {
      filePath: 'tests/client/trailing-valid.test.ts',
      source: 'test()\n'.repeat(MAX_TEST_FILE_LINES),
    },
    {
      filePath: 'tests/client/trailing-invalid.test.ts',
      source: 'test()\n'.repeat(MAX_TEST_FILE_LINES + 1),
    },
  ])).toEqual([
    {
      filePath: 'tests/client/trailing-invalid.test.ts',
      kind: 'file-too-large',
      lineCount: 2_001,
    },
  ])
})

it('格式化并断言测试结构诊断', () => {
  const diagnostics = readTestStructureDiagnostics([
    {
      filePath: 'tests/client/cross-domain.test.ts',
      source: 'import { fixture } from \'../protocol/support\'\n',
    },
    {
      filePath: 'tests/client/large.test.ts',
      source: 'test()\n'.repeat(MAX_TEST_FILE_LINES + 1),
    },
  ])

  expect(formatTestStructureDiagnostics(diagnostics)).toBe([
    '测试目录结构检查失败：',
    '- tests/client/cross-domain.test.ts: 领域测试不得相对导入 tests/protocol，跨领域共享能力应归入 tests/support',
    '- tests/client/large.test.ts: 测试文件共 2001 行，超过 2000 行上限',
  ].join('\n'))

  expect(() => {
    assertTestStructure([{
      filePath: 'tests/client/cross-domain.test.ts',
      source: 'import { fixture } from \'../protocol/support\'\n',
    }])
  }).toThrow(
    '测试目录结构检查失败：\n- tests/client/cross-domain.test.ts: 领域测试不得相对导入 tests/protocol，跨领域共享能力应归入 tests/support',
  )
})
