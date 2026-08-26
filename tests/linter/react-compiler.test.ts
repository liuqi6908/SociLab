import { expect, it } from 'vitest'
import { readReactCompilerDiagnostics, readReactCompilerSources } from './react-compiler'

/** -------------------- 测试 -------------------- */
it('真实 React Compiler 守卫捕获不可编译的 TSX', () => {
  const result = readReactCompilerDiagnostics([{
    filePath: 'invalid.fixture.tsx',
    source: `
      export function InvalidCompilerComponent() {
        let status = 'ready'

        try {
          status = 'working'
        }
        finally {
          status = 'done'
        }

        return <span>{status}</span>
      }
    `,
  }])

  expect(result.diagnostics.map(item => item.kind)).not.toEqual([])
})

it('真实 React Compiler 守卫接受可编译的 TSX', () => {
  const result = readReactCompilerDiagnostics([{
    filePath: 'valid.fixture.tsx',
    source: `
      interface ValidCompilerComponentProps {
        /** 展示内容 */
        label: string
      }

      export function ValidCompilerComponent(props: ValidCompilerComponentProps) {
        const { label } = props

        return <span>{label}</span>
      }
    `,
  }])

  expect(result.compiledFunctions).toBeGreaterThan(0)
  expect(result.diagnostics).toEqual([])
})

it('前端三处 TSX 保持零失败预算', () => {
  const result = readReactCompilerDiagnostics(readReactCompilerSources())

  expect(result.compiledFunctions).toBeGreaterThan(0)
  expect(result.diagnostics).toEqual([])
}, 30_000)
