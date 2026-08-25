import { expect, it } from 'vitest'
import { readReactComponentDeclarationDiagnostics } from './react-component-declarations'

/** -------------------- 测试 -------------------- */
it('react 组件声明检查器识别 PascalCase 箭头组件', () => {
  expect(readReactComponentDeclarationDiagnostics([
    {
      filePath: 'fixture.tsx',
      source: `
        import { useEffect, useMemo, useState } from 'react'

        export const ArrowComponent = () => <div />

        export function InvalidHookOrder() {
          useEffect(() => undefined, [])
          const [count] = useState(0)
          const handleClick = () => count
          const doubled = useMemo(() => count * 2, [count])

          return <button onClick={handleClick}>{doubled}</button>
        }
      `,
    },
  ]).map(item => item.name)).toEqual(['ArrowComponent'])
})

it('react 组件声明检查器忽略返回普通值的 PascalCase 回调', () => {
  expect(readReactComponentDeclarationDiagnostics([
    {
      filePath: 'component-evidence-valid.tsx',
      source: `
        import { memo } from 'react'

        const MemoizedValue = memo(() => 'value')
        const WrappedValue = memoize(() => 'value')
        const BrowserElement = () => document.createElement('div')

        export function CallbackOwner() {
          const SelectValue = (values: string[]) => values.at(0)
          const FormatValue = function (value: string) {
            return value.trim()
          }

          return <span>{FormatValue(SelectValue([MemoizedValue, WrappedValue, BrowserElement].map(String)) ?? '')}</span>
        }
      `,
    },
  ])).toEqual([])
})

it('react 组件声明检查器捕获 wrapper 与 block 箭头组件', () => {
  expect(readReactComponentDeclarationDiagnostics([
    {
      filePath: 'component-wrappers-invalid.tsx',
      source: `
        import { createElement, forwardRef, memo } from 'react'

        export const MemoComponent = memo(() => <div />)
        export const ForwardedComponent = forwardRef((_props, ref) => (
          <div ref={ref} />
        ))
        const FactoryComponent = () => createElement('div')
        export const BlockComponent = () => {
          return <section />
        }
      `,
    },
  ]).map(item => [item.name, item.line, item.column])).toEqual([
    ['MemoComponent', 4, 22],
    ['ForwardedComponent', 5, 22],
    ['FactoryComponent', 8, 15],
    ['BlockComponent', 9, 22],
  ])
})

it('react 组件声明检查器按词法绑定忽略 createElement 遮蔽', () => {
  expect(readReactComponentDeclarationDiagnostics([
    {
      filePath: 'create-element-parameter-shadow-valid.tsx',
      source: `
        import { createElement } from 'react'

        const FormatValue = (createElement: (value: string) => string) => createElement('value')
      `,
    },
    {
      filePath: 'create-element-local-shadow-valid.tsx',
      source: `
        import * as React from 'react'

        const ReadValue = () => {
          const React = {
            createElement: (value: string) => value,
          }

          return React.createElement('value')
        }
      `,
    },
  ])).toEqual([])
})
