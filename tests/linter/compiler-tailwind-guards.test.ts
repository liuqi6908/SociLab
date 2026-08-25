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
  it('发现同名来源的内联转换但不硬失败', async () => {
    const warnings: string[] = []
    const sources = [fixture('transformed-property-shorthand/invalid.fixture.ts')]

    const diagnostics = await warnTransformedPropertyShorthand(
      sources,
      message => warnings.push(message),
    )

    expect(diagnostics.map(item => item.property)).toEqual(['status'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('非强制')
  })

  it('接受提前命名并使用属性简写', async () => {
    const diagnostics = await readTransformedPropertyShorthandDiagnostics([
      fixture('transformed-property-shorthand/valid.fixture.ts'),
    ])

    expect(diagnostics).toEqual([])
  })

  it('真实仓库只报告建议而不加入硬失败预算', () => {
    const warnings: string[] = []
    const sources = readRepositoryTypeScriptSources(['packages', 'projects'])
      .filter(item => item.filePath.includes('/src/') && !item.filePath.endsWith('.d.ts'))
    const diagnostics = warnTransformedPropertyShorthand(
      sources,
      message => warnings.push(message),
    )

    expect(warnings).toHaveLength(diagnostics.length > 0 ? 1 : 0)
  })
})
