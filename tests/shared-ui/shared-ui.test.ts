import { readFileSync } from 'node:fs'
import { cn } from '@socilab/shared-ui/utils'
import { describe, expect, it } from 'vitest'

/** shared-ui 公开包配置 */
const packageJson = JSON.parse(readFileSync(
  new URL('../../packages/shared-ui/package.json', import.meta.url),
  'utf8',
)) as {
  exports: Record<string, unknown>
  scripts?: Record<string, string>
  sideEffects?: string[]
}

describe('shared ui', () => {
  it('合并条件类名并由后值覆盖冲突的 Tailwind 工具类', () => {
    expect(cn('px-2 py-1', false, ['px-4', { block: true, hidden: false }]))
      .toBe('py-1 px-4 block')
  })

  it('通过组件、工具和样式子路径公开能力并保留 CSS 副作用', () => {
    expect(typeof cn).toBe('function')
    expect(packageJson.exports).toEqual({
      './components/logo': './src/components/logo/index.tsx',
      './styles.css': './src/styles/index.css',
      './utils': './src/utils/index.ts',
    })
    expect(packageJson.sideEffects).toContain('**/*.css')
  })

  it('提供只运行 shared-ui 测试的 workspace 脚本', () => {
    expect(packageJson.scripts?.test).toBe('vitest --root ../.. run tests/shared-ui')
  })
})
