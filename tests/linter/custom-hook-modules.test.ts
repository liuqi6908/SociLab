import { expect, it } from 'vitest'
import { formatCustomHookModuleDiagnostics, readCustomHookModuleDiagnostics } from './custom-hook-modules'

/** -------------------- 测试 -------------------- */
it('自定义 Hook 模块边界检查器识别 JSX 模块中的函数、变量与嵌套实现', () => {
  const diagnostics = readCustomHookModuleDiagnostics([
    {
      filePath: 'component.tsx',
      source: `
        export function useFunctionHook() {
          return true
        }

        export const useArrowHook = () => false
        export const useFactoryHook = createHook()

        export function Component() {
          const useNestedHook = function () {
            return useFunctionHook()
          }

          return <span>{useNestedHook()}</span>
        }
      `,
    },
    {
      filePath: 'hooks.ts',
      source: `
        export function useSeparatedHook() {
          return true
        }
      `,
    },
  ])

  expect(diagnostics.map(item => item.hookName)).toEqual([
    'useFunctionHook',
    'useArrowHook',
    'useNestedHook',
  ])
  expect(formatCustomHookModuleDiagnostics(diagnostics))
    .toContain('应拆到 hooks.ts、hooks/ 或其他非 JSX 模块')
})

it('自定义 Hook 模块边界检查器接受组件内调用与非 JSX 实现', () => {
  expect(readCustomHookModuleDiagnostics([
    {
      filePath: 'component.tsx',
      source: `
        export function Component() {
          const value = useSeparatedHook()

          return <span>{value}</span>
        }
      `,
    },
    {
      filePath: 'hooks.ts',
      source: `
        export function useSeparatedHook() {
          return true
        }
      `,
    },
  ])).toEqual([])
})
