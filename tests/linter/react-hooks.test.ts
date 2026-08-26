import path from 'node:path'
import { ESLint } from 'eslint'
import { expect, it } from 'vitest'
import { readReactHookOrderDiagnostics, readReactHookSources } from './react-hooks'

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
/** React 官方 Hook 调用顺序规则 */
const rulesOfHooksId = 'react-hooks/rules-of-hooks'

/** -------------------- 测试 -------------------- */
it('hook 顺序检查器识别 EffectEvent、命令式屏障与包装组件逆序', async () => {
  const diagnostics = await readReactHookOrderDiagnostics([
    {
      filePath: 'hook-general-invalid.tsx',
      source: `
        export function BrokenEffectEvent() {
          useEffect(() => undefined, [])
          const sync = useEffectEvent(() => undefined)
          return sync
        }

        export function BrokenBarrier({ visible }: { visible: boolean }) {
          if (!visible)
            return null
          const [value] = useState(0)
          return value
        }

        export const BrokenNested = memo(forwardRef((_props, _ref) => {
          const handleClick = () => undefined
          const value = useMemo(() => 1, [])
          return <button onClick={handleClick}>{value}</button>
        }))

        export function BrokenEventAfterEffect() {
          useEffect(() => undefined, [])
          const handleClick = () => undefined
          return handleClick
        }

        export default React.memo(function BrokenDefault() {
          useEffect(() => undefined, [])
          const [value] = useState(0)
          return <span>{value}</span>
        })
      `,
    },
  ])

  expect(diagnostics.map(item => [item.scope, item.hookName, item.kind])).toEqual([
    ['BrokenEffectEvent', 'useEffectEvent', 'stage-order'],
    ['BrokenBarrier', 'useState', 'imperative-barrier'],
    ['BrokenNested', 'useMemo', 'stage-order'],
    ['BrokenEventAfterEffect', 'handleClick', 'stage-order'],
    ['BrokenDefault', 'useState', 'stage-order'],
  ])
})

it('hook 顺序检查器接受 common、state、memo、事件、EffectEvent 与 Effect 顺序', async () => {
  expect(await readReactHookOrderDiagnostics([
    {
      filePath: 'hook-general-valid.tsx',
      source: `
        export const ValidNested = memo(forwardRef((_props, _ref) => {
          const route = useRoute()
          const [value] = useState(0)
          const memoized = useMemo(() => value + 1, [value])
          const mutation = useMutation({ mutationFn: async () => memoized })
          const handleClick = () => mutation.mutate()
          const sync = useEffectEvent(() => handleClick())

          useEffect(() => sync(), [sync])
          return <button onClick={handleClick} data-route={route}>{memoized}</button>
        }))
      `,
    },
  ])).toEqual([])
})

it('hook 顺序检查器按源码位置排列同一声明项并保持最高阶段', async () => {
  const diagnostics = await readReactHookOrderDiagnostics([
    {
      filePath: 'hook-order-edge.tsx',
      source: `
        import { useEffect, useMemo, useState } from 'react'

        export function SameStatementValid() {
          const memoized = useMemo(() => 1, []), handleClick = () => memoized

          return <button onClick={handleClick}>{memoized}</button>
        }

        export function SameStatementInvalid() {
          const handleClick = () => 1, memoized = useMemo(() => 1, [])

          return <button onClick={handleClick}>{memoized}</button>
        }

        export function HighestStageMustNotRollback() {
          useEffect(() => undefined, [])
          const [value] = useState(0)
          const memoized = useMemo(() => value, [value])

          return <span>{memoized}</span>
        }
      `,
    },
  ])

  expect(diagnostics.map(item => `${item.scope}:${item.hookName}`)).toEqual([
    'SameStatementInvalid:useMemo',
    'HighestStageMustNotRollback:useState',
    'HighestStageMustNotRollback:useMemo',
  ])
  expect(diagnostics.map(item => [item.line, item.column])).toEqual([
    [11, 51],
    [18, 27],
    [19, 28],
  ])
})

it('react Hook 源码枚举只覆盖 SociLab React 专属 roots', () => {
  expect(readReactHookSources().map(item => item.filePath)).toEqual([
    'packages/shared-ui/src/utils/cn.ts',
    'packages/shared-ui/src/utils/index.ts',
    'projects/admin/src/app/index.tsx',
    'projects/admin/src/main.tsx',
    'projects/admin/src/providers/query/context.ts',
    'projects/admin/src/providers/query/hooks.ts',
    'projects/admin/src/providers/query/index.tsx',
    'projects/admin/src/router/index.tsx',
    'projects/admin/src/routes/__root.tsx',
    'projects/admin/src/routes/index.tsx',
    'projects/client/src/app/index.tsx',
    'projects/client/src/main.tsx',
    'projects/client/src/providers/query/context.ts',
    'projects/client/src/providers/query/hooks.ts',
    'projects/client/src/providers/query/index.tsx',
    'projects/client/src/router/index.tsx',
    'projects/client/src/routes/__root.tsx',
    'projects/client/src/routes/index.tsx',
  ])
})

it('react Hook 源码由官方 rules-of-hooks 全仓检查且不存在漏检', async () => {
  const eslint = new ESLint({
    allowInlineConfig: false,
    cache: false,
    cwd: repositoryRoot,
    ignore: false,
    overrideConfig: {
      languageOptions: {
        parserOptions: { projectService: false },
      },
    },
    ruleFilter: ({ ruleId }) => ruleId === rulesOfHooksId,
  })
  const invalidSource = `
    import { useState } from 'react'
    export function Broken({ visible }: { visible: boolean }) {
      if (!visible) return null
      const [value] = useState(0)
      return <span>{value}</span>
    }
  `

  for (const filePath of [
    'packages/shared-ui/src/linter-fixture.tsx',
    'projects/admin/src/linter-fixture.tsx',
    'projects/client/src/linter-fixture.tsx',
  ]) {
    const [result] = await eslint.lintText(invalidSource, {
      filePath: path.resolve(repositoryRoot, filePath),
      warnIgnored: false,
    })

    expect(result?.messages.some(message => (
      message.ruleId === rulesOfHooksId
    ))).toBe(true)
  }

  const sources = readReactHookSources()
  const checkedFiles = new Set<string>()
  const diagnostics: string[] = []
  const results = await eslint.lintFiles(sources.map(source => (
    path.resolve(repositoryRoot, source.filePath)
  )))

  for (const result of results) {
    const filePath = path.relative(repositoryRoot, result.filePath)
      .split(path.sep)
      .join('/')

    checkedFiles.add(filePath)
    diagnostics.push(...result.messages
      .filter(message => message.fatal || message.ruleId === rulesOfHooksId)
      .map(message => (
        `${filePath}:${message.line}:${message.column} ${message.message}`
      )))
  }

  for (const source of sources) {
    if (!checkedFiles.has(source.filePath))
      diagnostics.push(`${source.filePath}: ESLint 未检查该源码`)
  }

  expect(sources.length).toBeGreaterThan(0)
  expect(diagnostics).toEqual([])
}, 30_000)
