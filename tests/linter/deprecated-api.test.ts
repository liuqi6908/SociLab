import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDeprecatedApiDiagnostics } from './deprecated-api'

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/deprecated-api')

/**
 * 读取废弃 API 守卫夹具
 */
function fixture(name: string) {
  return {
    filePath: `fixtures/${name}.ts`,
    source: readFileSync(path.join(fixtureRoot, `${name}.fixture`), 'utf8'),
  }
}

/** -------------------- 测试 -------------------- */
describe('废弃 API 守卫', () => {
  it('只报告 Language Service suggestions 中的废弃 API 调用', () => {
    const diagnostics = readDeprecatedApiDiagnostics([fixture('invalid')])

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
    expect(readDeprecatedApiDiagnostics([fixture('valid')])).toEqual([])
  })
})
