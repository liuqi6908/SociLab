import { describe, expect, test } from 'vitest'
import { readJsxReturnLayoutDiagnostics } from './jsx-return-layout'

/** -------------------- 测试 -------------------- */
describe('jsx return 布局守卫', () => {
  test('报告可收成单行的括号换行 JSX return', async () => {
    expect(await readJsxReturnLayoutDiagnostics([{
      filePath: 'fixtures/invalid.tsx',
      source: [
        'export function Invalid() {',
        '  return (',
        '    <Box data/>',
        '  )',
        '}',
      ].join('\n'),
    }])).toEqual([
      {
        column: 3,
        filePath: 'fixtures/invalid.tsx',
        line: 2,
        singleLineLength: 20,
      },
    ])
  })

  test('接受单行、超长及 JSX 本身跨行的 return', async () => {
    const longInlineJsx = `<Box text="${'x'.repeat(97)}" />`

    expect(await readJsxReturnLayoutDiagnostics([{
      filePath: 'fixtures/valid.tsx',
      source: [
        'export function Valid() {',
        '  if (Math.random() > 0.5)',
        '    return <Box value />',
        '',
        '  return (',
        `    ${longInlineJsx}`,
        '  )',
        '}',
        '',
        'export function AlreadyMultiline() {',
        '  return (',
        '    <Box',
        '      value',
        '      text="ok"',
        '    />',
        '  )',
        '}',
      ].join('\n'),
    }])).toEqual([])
  })

  test('只报告折叠后恰好 120 字符的多行 return', async () => {
    const boundaryJsx = `<Box text="${'x'.repeat(96)}" />`

    expect(await readJsxReturnLayoutDiagnostics([{
      filePath: 'fixtures/boundary.tsx',
      source: [
        'export function Boundary() {',
        '  return (',
        `    ${boundaryJsx}`,
        '  )',
        '}',
      ].join('\n'),
    }])).toEqual([
      {
        column: 3,
        filePath: 'fixtures/boundary.tsx',
        line: 2,
        singleLineLength: 120,
      },
    ])
  })
})
