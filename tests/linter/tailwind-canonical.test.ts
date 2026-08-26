import { expect, test } from 'vitest'
import {
  readTailwindCanonicalDiagnostics,
  readTailwindCssConflictDiagnostics,
  readTailwindSources,
} from './tailwind-canonical'

/** -------------------- 测试 -------------------- */
test('tailwind canonical 检查器识别非 canonical utility', async () => {
  const diagnostics = await readTailwindCanonicalDiagnostics([{
    filePath: 'invalid.fixture.tsx',
    source: `
      export function InvalidTailwindComponent() {
        return <div className="!w-fit aspect-[4/3] flex block" />
      }
    `,
  }])

  expect(diagnostics.map(item => [item.className, item.suggestion])).toEqual([
    ['!w-fit', 'w-fit!'],
    ['aspect-[4/3]', 'aspect-4/3'],
  ])
})

test('tailwind CSS 属性冲突检查器识别同一静态列表中的覆盖', async () => {
  const diagnostics = await readTailwindCssConflictDiagnostics([{
    filePath: 'invalid.fixture.tsx',
    source: `
      export function InvalidTailwindComponent() {
        return <div className="!w-fit aspect-[4/3] flex block" />
      }
    `,
  }])

  expect(diagnostics.map(item => [
    item.className,
    item.conflictingClassNames,
  ])).toEqual([
    ['block', ['flex']],
    ['flex', ['block']],
  ])
})

test('tailwind 守卫接受 canonical 且无冲突的 utility', async () => {
  const sources = [{
    filePath: 'valid.fixture.tsx',
    source: `
      export function ValidTailwindComponent() {
        return <div className="w-fit! aspect-4/3 flex" />
      }
    `,
  }]

  await expect(readTailwindCanonicalDiagnostics(sources)).resolves.toEqual([])
  await expect(readTailwindCssConflictDiagnostics(sources)).resolves.toEqual([])
})

test('tailwind canonical 检查器识别 LSP 已验证的等价 utility', async () => {
  const diagnostics = await readTailwindCanonicalDiagnostics([{
    filePath: 'fixture.tsx',
    source: `
      <div className="text-[length:var(--dialog-font-size)] !w-fit aspect-[4/3] [&>*]:pointer-events-auto" />
      const slots = {
        body: 'rounded-[var(--dialog-radius)]!',
        icon: '[&_.icon]:![transform:none]',
        scroll: '[scrollbar-gutter:stable_both-edges]',
      }
    `,
  }])

  expect(diagnostics.map(item => [item.className, item.suggestion])).toEqual([
    ['!w-fit', 'w-fit!'],
    ['[&>*]:pointer-events-auto', '*:pointer-events-auto'],
    ['aspect-[4/3]', 'aspect-4/3'],
    [
      'text-[length:var(--dialog-font-size)]',
      'text-(length:--dialog-font-size)',
    ],
    [
      'rounded-[var(--dialog-radius)]!',
      'rounded-(--dialog-radius)!',
    ],
    [
      '[&_.icon]:![transform:none]',
      '[&_.icon]:transform-none!',
    ],
    [
      '[scrollbar-gutter:stable_both-edges]',
      'scrollbar-gutter-both',
    ],
  ])
})

test('tailwind canonical 检查器使用 spacing 函数与比例简化任意值', async () => {
  const diagnostics = await readTailwindCanonicalDiagnostics([{
    filePath: 'fixture.tsx',
    source: `
      <div className="w-[calc(100%+calc(var(--spacing)*3))]! group-data-horizontal/tabs:after:bottom-[-5px] top-[8px]" />
    `,
  }])

  expect(diagnostics.map(item => [item.className, item.suggestion])).toEqual([
    [
      'group-data-horizontal/tabs:after:bottom-[-5px]',
      'group-data-horizontal/tabs:after:-bottom-1.25',
    ],
    ['top-[8px]', 'top-2'],
    [
      'w-[calc(100%+calc(var(--spacing)*3))]!',
      'w-[calc(100%+(--spacing(3)))]!',
    ],
  ])
})

test('tailwind CSS 属性冲突检查器识别顶层选择器变体的相同声明', async () => {
  const diagnostics = await readTailwindCssConflictDiagnostics([{
    filePath: 'fixture.tsx',
    source: `
      <div className="data-[variant=legend]:text-base data-[variant=label]:text-sm" />
    `,
  }])

  expect(diagnostics.map(item => [
    item.className,
    item.conflictingClassNames,
  ])).toEqual([
    [
      'data-[variant=label]:text-sm',
      ['data-[variant=legend]:text-base'],
    ],
    [
      'data-[variant=legend]:text-base',
      ['data-[variant=label]:text-sm'],
    ],
  ])
})

test('tailwind CSS 属性冲突检查器保留嵌套规则上下文并接受拆分 cn 语义分组', async () => {
  await expect(readTailwindCssConflictDiagnostics([{
    filePath: 'nested-context.tsx',
    source: `
      <div className="hover:text-base hover:text-sm sm:text-base sm:text-sm" />
    `,
  }])).resolves.toEqual([])

  await expect(readTailwindCssConflictDiagnostics([{
    filePath: 'split-cn.tsx',
    source: `
      <div className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3',
        'has-[>[data-slot=radio-group]]:gap-3',
        'data-[variant=legend]:text-base',
        'data-[variant=label]:text-sm',
      )} />
    `,
  }])).resolves.toEqual([])
})

test('真实前端源码通过 canonical 与 CSS 冲突硬守卫', async () => {
  const sources = readTailwindSources()

  await expect(readTailwindCanonicalDiagnostics(sources)).resolves.toEqual([])
  await expect(readTailwindCssConflictDiagnostics(sources)).resolves.toEqual([])
}, 30_000)
