import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRepositoryTypeScriptSources } from './quality-guards'
import {
  readReactCompilerDiagnostics,
  readReactCompilerSources,
} from './react-compiler'
import {
  readTailwindCanonicalDiagnostics,
  readTailwindCssConflictDiagnostics,
  readTailwindSources,
} from './tailwind'
import {
  formatTransformedPropertyShorthandDiagnostics,
  readTransformedPropertyShorthandDiagnostics,
  warnTransformedPropertyShorthand,
} from './transformed-property-shorthand'

/** -------------------- 测试夹具 -------------------- */
/** 守卫正反例目录 */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures')

/**
 * 读取磁盘中的真实守卫 fixture
 */
function fixture(filePath: string) {
  return {
    filePath,
    source: readFileSync(path.join(fixtureRoot, filePath), 'utf8'),
  }
}

/** -------------------- React Compiler -------------------- */
describe('真实 React Compiler 守卫', () => {
  it('捕获真实 Compiler 无法编译的 TSX', () => {
    const result = readReactCompilerDiagnostics([
      fixture('react-compiler/invalid.fixture.tsx'),
    ])

    expect(result.diagnostics.map(item => item.kind)).not.toEqual([])
  })

  it('接受真实 Compiler 可编译的 TSX', () => {
    const result = readReactCompilerDiagnostics([
      fixture('react-compiler/valid.fixture.tsx'),
    ])

    expect(result.compiledFunctions).toBeGreaterThan(0)
    expect(result.diagnostics).toEqual([])
  })

  it('前端三处 TSX 保持零失败预算', () => {
    const result = readReactCompilerDiagnostics(readReactCompilerSources())

    expect(result.compiledFunctions).toBeGreaterThan(0)
    expect(result.diagnostics).toEqual([])
  })
})

/** -------------------- Tailwind -------------------- */
describe('真实 Tailwind 守卫', () => {
  it('捕获真实 Design System 给出的非 canonical utility', async () => {
    const diagnostics = await readTailwindCanonicalDiagnostics([
      fixture('tailwind/invalid.fixture.tsx'),
    ])

    expect(diagnostics.map(item => [item.className, item.suggestion])).toEqual([
      ['!w-fit', 'w-fit!'],
      ['aspect-[4/3]', 'aspect-4/3'],
    ])
  })

  it('捕获同一静态 class 列表中的 CSS 属性冲突', async () => {
    const diagnostics = await readTailwindCssConflictDiagnostics([
      fixture('tailwind/invalid.fixture.tsx'),
    ])

    expect(diagnostics.map(item => [
      item.className,
      item.conflictingClassNames,
    ])).toEqual([
      ['block', ['flex']],
      ['flex', ['block']],
    ])
  })

  it('接受 canonical 且无冲突的 utility', async () => {
    const sources = [fixture('tailwind/valid.fixture.tsx')]

    await expect(readTailwindCanonicalDiagnostics(sources)).resolves.toEqual([])
    await expect(readTailwindCssConflictDiagnostics(sources)).resolves.toEqual([])
  })

  it('真实前端源码通过 canonical 与 CSS 冲突硬守卫', async () => {
    const sources = readTailwindSources()

    await expect(readTailwindCanonicalDiagnostics(sources)).resolves.toEqual([])
    await expect(readTailwindCssConflictDiagnostics(sources)).resolves.toEqual([])
  })
})

/** -------------------- Warning -------------------- */
describe('对象字段转换属性简写 warning', () => {
  it('发现同名来源的内联转换并报告完整 warning', () => {
    const warnings: string[] = []
    const sources = [fixture('transformed-property-shorthand/invalid.fixture.ts')]

    const diagnostics = warnTransformedPropertyShorthand(
      sources,
      message => warnings.push(message),
    )
    const message = [
      '对象字段转换写法建议（非强制，请结合具体语义判断）：',
      [
        '- transformed-property-shorthand/invalid.fixture.ts:9:12 ',
        'status 内联转换了同名来源；该建议非强制，请结合具体语义判断',
      ].join(''),
    ].join('\n')

    expect(diagnostics).toEqual([{
      column: 12,
      filePath: 'transformed-property-shorthand/invalid.fixture.ts',
      line: 9,
      message: 'status 内联转换了同名来源；该建议非强制，请结合具体语义判断',
      property: 'status',
    }])
    expect(formatTransformedPropertyShorthandDiagnostics(diagnostics)).toBe(message)
    expect(warnings).toEqual([message])
  })

  it('提示同作用域原字段与返回别名冲突', () => {
    const diagnostics = readTransformedPropertyShorthandDiagnostics([
      fixture('transformed-property-shorthand/alias-return-invalid.fixture.ts'),
    ])

    expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
      [
        'threadId: threadId 返回字段映射了 selectedThreadId，且同一作用域已有 threadId',
        '；可将前序临时绑定命名为 _threadId，让最终值使用属性简写',
        '；该建议非强制，请结合具体语义判断',
      ].join(''),
    ])
  })

  it('提示小型返回对象混合直接读取与内联派生', () => {
    const diagnostics = readTransformedPropertyShorthandDiagnostics([
      fixture('transformed-property-shorthand/mixed-return-invalid.fixture.ts'),
    ])

    expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
      [
        'label: label、status、pending 在返回对象中内联读取或派生',
        '；若拆分能提升可读性，可考虑提前命名',
        '；该建议非强制，请结合具体语义判断',
      ].join(''),
    ])
  })

  it('提示小型调用对象混合属性简写与内联派生', () => {
    const diagnostics = readTransformedPropertyShorthandDiagnostics([
      fixture('transformed-property-shorthand/mixed-call-invalid.fixture.ts'),
    ])

    expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
      [
        'hidden: hidden、owner 在调用参数对象中内联读取或派生',
        '；若拆分能提升可读性，可考虑将 1–4 个关键派生值提前命名',
        '；该建议非强制，请结合具体语义判断',
      ].join(''),
    ])
  })

  it('接受提前命名并使用属性简写', () => {
    const diagnostics = readTransformedPropertyShorthandDiagnostics([
      fixture('transformed-property-shorthand/valid.fixture.ts'),
    ])

    expect(diagnostics).toEqual([])
  })

  it('真实仓库只报告建议而不加入硬失败预算', () => {
    const sources = readRepositoryTypeScriptSources(['packages', 'projects'])
      .filter(item => item.filePath.includes('/src/') && !item.filePath.endsWith('.d.ts'))

    expect(() => warnTransformedPropertyShorthand(sources)).not.toThrow()
  })
})
