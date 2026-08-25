import { expect, test } from 'vitest'
import {
  readTailwindCanonicalDiagnostics,
  readTailwindCssConflictDiagnostics,
  readTailwindSources,
} from './tailwind-canonical'

/** -------------------- 测试 -------------------- */
test('Tailwind canonical 检查器识别非 canonical utility', async () => {
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

test('Tailwind CSS 属性冲突检查器识别同一静态列表中的覆盖', async () => {
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

test('Tailwind 守卫接受 canonical 且无冲突的 utility', async () => {
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

test('真实前端源码通过 canonical 与 CSS 冲突硬守卫', async () => {
  const sources = readTailwindSources()

  await expect(readTailwindCanonicalDiagnostics(sources)).resolves.toEqual([])
  await expect(readTailwindCssConflictDiagnostics(sources)).resolves.toEqual([])
}, 30_000)
