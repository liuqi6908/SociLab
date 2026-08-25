import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJsxReturnLayoutDiagnostics } from './jsx-return-layout'

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/jsx-return-layout')

/**
 * 读取 JSX return 布局夹具
 */
function fixture(name: string) {
  return {
    filePath: `fixtures/${name}.tsx`,
    source: readFileSync(path.join(fixtureRoot, `${name}.fixture`), 'utf8'),
  }
}

/** -------------------- 测试 -------------------- */
describe('jsx return 布局守卫', () => {
  it('报告可收成单行的括号换行 JSX return', () => {
    expect(readJsxReturnLayoutDiagnostics([fixture('invalid')])).toEqual([
      {
        column: 3,
        filePath: 'fixtures/invalid.tsx',
        line: 2,
        singleLineLength: 20,
      },
    ])
  })

  it('接受单行、超长及 JSX 本身跨行的 return', () => {
    expect(readJsxReturnLayoutDiagnostics([fixture('valid')])).toEqual([])
  })

  it('只报告折叠后恰好 120 字符的多行 return', () => {
    expect(readJsxReturnLayoutDiagnostics([fixture('boundary')])).toEqual([
      {
        column: 3,
        filePath: 'fixtures/boundary.tsx',
        line: 2,
        singleLineLength: 120,
      },
    ])
  })
})
