import { expect, it } from 'vitest'
import {
  MAX_CN_SEGMENT_LENGTH_DIFFERENCE,
  MAX_STATIC_CLASS_NAME_LENGTH,
  readClassNameCompositionDiagnostics,
} from './class-name-composition'

/** -------------------- 工具函数 -------------------- */
/**
 * 创建内联虚拟源码
 */
function source(filePath: string, content: string) {
  return { filePath, source: content }
}

/** -------------------- 测试 -------------------- */
it('className 组合检查器识别数组、模板与字符串拼接', () => {
  const diagnostics = readClassNameCompositionDiagnostics([
    source('invalid.tsx', `
      export function InvalidClassName({ active, color }: { active: boolean; color: string }) {
        const joined = ['flex', active && 'gap-2'].filter(Boolean).join(' ')

        return (
          <>
            <div className={\`bg-\${color}\`} />
            <div className={'flex ' + (active ? 'gap-2' : '')} />
            <div className={joined} />
            <div className={cn('flex', 'bg-' + color)} />
            <div className={cn(\`text-\${color}\`)} />
            <div className={cn(['block', active && 'gap-2'].filter(Boolean).join(' '))} />
            <div className={cn({ ['border-' + color]: active })} />
            <div className={cn(...['bg-' + color])} />
            <div className={cn({ ...{ ['ring-' + color]: active } })} />
          </>
        )
      }
    `),
  ])

  expect(diagnostics.map(item => [item.kind, item.line])).toEqual([
    ['array-composition', 3],
    ['dynamic-template', 7],
    ['string-concatenation', 8],
    ['string-concatenation', 10],
    ['dynamic-template', 11],
    ['array-composition', 12],
    ['string-concatenation', 13],
    ['string-concatenation', 14],
    ['string-concatenation', 15],
  ])
})

it('className 组合检查器接受静态 cn 与最近词法绑定', () => {
  expect(readClassNameCompositionDiagnostics([
    source('shadowing-valid.tsx', `
      const className = 'flex'

      export function ValidShadowing({ active }: { active: boolean }) {
        const className = active ? 'grid' : 'inline-flex'
        return <div className={className} />
      }
    `),
  ])).toEqual([])

  expect(readClassNameCompositionDiagnostics([
    source('shadowing-invalid.tsx', `
      const classes = 'flex'

      export function InvalidShadowing({ color }: { color: string }) {
        const classes = 'bg-' + color

        return <div className={classes} />
      }
    `),
  ]).map(item => item.kind)).toEqual(['string-concatenation'])
})

it('className 布局检查器识别长静态类、root-only classNames 与分组失衡', () => {
  const diagnostics = readClassNameCompositionDiagnostics([
    source('layout-invalid.tsx', `
      import { EXPORTED_CLASS_NAMES } from './layout-styles'

      const PANEL_CLASS_NAME = 'min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-lg pb-lg'
      const LOCAL_CLASS_NAMES = { item: 'px-sm' }
      const rootOnly = { root: 'w-full' }

      export const view = (
        <>
          <div className={PANEL_CLASS_NAME} />
          <span className={PANEL_CLASS_NAME} />
          <Menu classNames={LOCAL_CLASS_NAMES} />
          <Menu classNames={EXPORTED_CLASS_NAMES} />
          <Button classNames={rootOnly} />
          <Button classNames={{ root: 'w-full' }} />
          <div className={cn('min-h-0 w-full flex-1', 'overflow-x-hidden overflow-y-auto px-lg pb-lg')} />
          <div className={cn('flex gap-sm')} />
          <div className={cn(
            'absolute inset-x-0 bottom-0 z-10 border-t border-sidebar-border bg-sidebar',
            'pl-xs',
          )}
          />
        </>
      )
    `),
    source('layout-styles.ts', `
      export const EXPORTED_CLASS_NAMES = { item: 'py-sm' }
    `),
  ])

  expect(diagnostics.map(item => [item.filePath, item.target, item.kind])).toEqual([
    ['layout-invalid.tsx', 'PANEL_CLASS_NAME', 'long-static-class'],
    ['layout-invalid.tsx', 'LOCAL_CLASS_NAMES', 'single-use-class-constant'],
    ['layout-invalid.tsx', 'classNames', 'root-only-class-names'],
    ['layout-invalid.tsx', 'classNames', 'root-only-class-names'],
    ['layout-invalid.tsx', 'className', 'long-cn-single-line'],
    ['layout-invalid.tsx', 'className', 'short-static-cn'],
    ['layout-invalid.tsx', 'className', 'inline-multiline-class-attribute'],
    ['layout-invalid.tsx', 'className', 'unbalanced-cn-segments'],
    ['layout-styles.ts', 'EXPORTED_CLASS_NAMES', 'single-use-class-constant'],
  ])
  expect(MAX_CN_SEGMENT_LENGTH_DIFFERENCE).toBe(32)
  expect(MAX_STATIC_CLASS_NAME_LENGTH).toBe(56)
})

it('className 绑定检查器区分参数、catch 与循环作用域遮蔽', () => {
  expect(readClassNameCompositionDiagnostics([
    source('binding-shadowing-valid.tsx', `
      const PARAM_CLASS_NAME = 'flex gap-sm'
      const localRoot = { root: 'outer-local' }
      const caughtRoot = { root: 'outer-catch' }
      const destructuredRoot = { root: 'outer-destructured' }

      export function ParameterShadow(PARAM_CLASS_NAME: string) {
        return <div className={PARAM_CLASS_NAME} />
      }

      export function LocalShadow() {
        let localRoot: { root: string }

        localRoot = { root: 'inner-local' }
        return <Button classNames={localRoot} />
      }

      export function CatchShadow() {
        try {
          throw { root: 'inner-catch' }
        }
        catch (caughtRoot) {
          return <Button classNames={caughtRoot} />
        }
      }

      export function DestructuredShadow({ destructuredRoot }: {
        destructuredRoot: { root: string }
      }) {
        return <Button classNames={destructuredRoot} />
      }
    `),
  ])).toEqual([])

  expect(readClassNameCompositionDiagnostics([
    source('loop-binding-scope.tsx', `
      const FOR_CLASS_NAME = 'flex gap-sm'
      const loopInRoot = { root: 'outer-in' }
      const loopOfRoot = { root: 'outer-of' }
      const varRoot = { root: 'outer-var' }

      export function ForScope({ start }: { start: string }) {
        for (
          let FOR_CLASS_NAME = start;
          FOR_CLASS_NAME;
          FOR_CLASS_NAME = ''
        ) {
          <div className={FOR_CLASS_NAME} />
        }

        return <div className={FOR_CLASS_NAME} />
      }

      export function ForInScope({ roots }: { roots: object }) {
        for (const loopInRoot in roots) {
          <Button classNames={loopInRoot} />
        }

        return <Button classNames={loopInRoot} />
      }

      export function ForOfScope({ roots }: { roots: unknown[] }) {
        for (const loopOfRoot of roots) {
          <Button classNames={loopOfRoot} />
        }

        return <Button classNames={loopOfRoot} />
      }

      export function VarForOfScope({ roots }: { roots: unknown[] }) {
        for (var varRoot of roots) {
          <Button classNames={varRoot} />
        }

        return <Button classNames={varRoot} />
      }
    `),
  ]).map(item => item.kind)).toEqual([
    'single-use-class-constant',
    'root-only-class-names',
    'root-only-class-names',
  ])
})

it('className 常量检查器按相对模块路径解析跨文件同名导出', () => {
  const diagnostics = readClassNameCompositionDiagnostics([
    source('modules/styles-a.ts', `export const ROOT_CLASS_NAME = 'flex items-center'`),
    source('modules/styles-b.ts', `export const ROOT_CLASS_NAME = 'grid gap-sm'`),
    source('modules/consumer-a.tsx', `
      import { ROOT_CLASS_NAME } from './styles-a'

      export function ModuleAConsumer() {
        return <div className={ROOT_CLASS_NAME} />
      }
    `),
    source('modules/consumer-b.tsx', `
      import { ROOT_CLASS_NAME } from './styles-b'

      export function ModuleBConsumer() {
        return (
          <>
            <div className={ROOT_CLASS_NAME} />
            <div className={ROOT_CLASS_NAME} />
          </>
        )
      }
    `),
  ])

  expect(diagnostics.map(item => [item.filePath, item.target, item.kind])).toEqual([[
    'modules/styles-a.ts',
    'ROOT_CLASS_NAME',
    'single-use-class-constant',
  ]])
})

it('className 常量检查器沿 named re-export 与循环引用链定位真实消费点', () => {
  const diagnostics = readClassNameCompositionDiagnostics([
    source('modules/barrel/styles-a.ts', `
      export const ROOT_CLASS_NAME = 'flex items-center'

      export function readNestedStyles() {
        const ROOT_CLASS_NAME = 'grid gap-sm'

        return [ROOT_CLASS_NAME, ROOT_CLASS_NAME]
      }
    `),
    source('modules/barrel/styles-b.ts', `export const ROOT_CLASS_NAME = 'flex justify-center'`),
    source('modules/barrel/local.ts', `
      import { ROOT_CLASS_NAME as LOCAL_ROOT_CLASS_NAME } from './styles-b'

      export { LOCAL_ROOT_CLASS_NAME as SECOND_ROOT_CLASS_NAME }
    `),
    source('modules/barrel/index.ts', `
      export { ROOT_CLASS_NAME } from './styles-a'
      export { SECOND_ROOT_CLASS_NAME } from './local'
    `),
    source('modules/barrel/consumer.tsx', `
      import {
        ROOT_CLASS_NAME,
        SECOND_ROOT_CLASS_NAME,
      } from './index'

      export function BarrelConsumer() {
        return (
          <>
            <div className={ROOT_CLASS_NAME} />
            <div className={SECOND_ROOT_CLASS_NAME} />
            <div className={SECOND_ROOT_CLASS_NAME} />
          </>
        )
      }
    `),
    source('modules/barrel/cycle-a.ts', `export { CYCLE_CLASS_NAME } from './cycle-b'`),
    source('modules/barrel/cycle-b.ts', `export { CYCLE_CLASS_NAME } from './cycle-a'`),
    source('modules/barrel/cycle-consumer.tsx', `
      import { CYCLE_CLASS_NAME } from './cycle-a'

      export function CycleConsumer() {
        return <div className={CYCLE_CLASS_NAME} />
      }
    `),
  ])

  expect(diagnostics.map(item => [item.filePath, item.line, item.target, item.kind])).toEqual([[
    'modules/barrel/styles-a.ts',
    2,
    'ROOT_CLASS_NAME',
    'single-use-class-constant',
  ]])
})
