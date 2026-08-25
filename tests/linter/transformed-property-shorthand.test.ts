import { expect, it } from 'vitest'
import {
  formatTransformedPropertyShorthandDiagnostics,
  readTransformedPropertyShorthandDiagnostics,
  readTransformedPropertyShorthandSources,
  warnTransformedPropertyShorthand,
} from './transformed-property-shorthand'

/** -------------------- 测试 -------------------- */
it('对象字段转换属性简写检查器识别同名来源的内联转换', () => {
  const warnings: string[] = []
  const diagnostics = warnTransformedPropertyShorthand([{
    filePath: 'invalid.fixture.ts',
    source: `
      interface Input {
        /** 原始状态 */
        status: string
      }

      export function project(input: Input) {
        const { status } = input

        return { status: normalizeStatus(status) }
      }

      function normalizeStatus(status: string) {
        return status.trim()
      }
    `,
  }], message => warnings.push(message))

  const message = [
    '对象字段转换写法建议（非强制，请结合具体语义判断）：',
    '- invalid.fixture.ts:10:18 status 内联转换了同名来源；该建议非强制，请结合具体语义判断',
  ].join('\n')

  expect(diagnostics).toEqual([{
    column: 18,
    filePath: 'invalid.fixture.ts',
    line: 10,
    message: 'status 内联转换了同名来源；该建议非强制，请结合具体语义判断',
    property: 'status',
  }])
  expect(formatTransformedPropertyShorthandDiagnostics(diagnostics)).toBe(message)
  expect(warnings).toEqual([message])
})

it('对象字段转换属性简写检查器提示同作用域返回字段重命名', () => {
  const diagnostics = readTransformedPropertyShorthandDiagnostics([{
    filePath: 'alias-return-invalid.fixture.ts',
    source: `
      interface ThreadTarget {
        /** 线程标识 */
        threadId: string
      }

      export function selectThread(source: ThreadTarget, target: ThreadTarget) {
        const { threadId } = source
        const { threadId: selectedThreadId } = target
        const previousThreadId = threadId

        return { previousThreadId, threadId: selectedThreadId }
      }
    `,
  }])

  expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
    [
      'threadId: threadId 返回字段映射了 selectedThreadId，且同一作用域已有 threadId',
      '；可将前序临时绑定命名为 _threadId，让最终值使用属性简写',
      '；该建议非强制，请结合具体语义判断',
    ].join(''),
  ])
})

it('对象字段转换属性简写检查器提示小型返回对象混合直接读取与内联派生', () => {
  const diagnostics = readTransformedPropertyShorthandDiagnostics([{
    filePath: 'mixed-return-invalid.fixture.ts',
    source: `
      interface ViewInput {
        /** 展示标签 */
        label: string
        /** 展示状态 */
        status: string
      }

      interface ViewSession {
        /** 是否等待处理 */
        pending: boolean
      }

      export function createViewState(
        options: string[],
        input: ViewInput,
        session?: ViewSession,
      ) {
        return {
          options,
          label: input.label,
          status: input.status,
          pending: session?.pending ?? false,
        }
      }
    `,
  }])

  expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
    [
      'label: label、status、pending 在返回对象中内联读取或派生',
      '；若拆分能提升可读性，可考虑提前命名',
      '；该建议非强制，请结合具体语义判断',
    ].join(''),
  ])
})

it('对象字段转换属性简写检查器提示小型调用对象混合属性简写与内联派生', () => {
  const diagnostics = readTransformedPropertyShorthandDiagnostics([{
    filePath: 'mixed-call-invalid.fixture.ts',
    source: `
      interface Submitter {
        /** 提交所有者 */
        owner: string
        /** 提交数据 */
        submit: (input: object) => object
      }

      export function submitRequest(
        submitter: Submitter,
        requestId: string,
        userId: string,
        input: string[],
      ) {
        return submitter.submit({
          requestId,
          userId,
          input,
          hidden: createHidden(input),
          owner: submitter.owner,
        })
      }

      function createHidden(input: string[]) {
        return input.length === 0
      }
    `,
  }])

  expect(diagnostics.map(item => `${item.property}: ${item.message}`)).toEqual([
    [
      'hidden: hidden、owner 在调用参数对象中内联读取或派生',
      '；若拆分能提升可读性，可考虑将 1–4 个关键派生值提前命名',
      '；该建议非强制，请结合具体语义判断',
    ].join(''),
  ])
})

it('对象字段转换属性简写检查器接受提前命名并使用属性简写', () => {
  expect(readTransformedPropertyShorthandDiagnostics([{
    filePath: 'valid.fixture.ts',
    source: `
      interface Input {
        /** 原始状态 */
        status: string
      }

      export function project(input: Input) {
        const { status: _status } = input
        const status = normalizeStatus(_status)

        return { status }
      }

      function normalizeStatus(status: string) {
        return status.trim()
      }

      interface ThreadTarget {
        /** 线程标识 */
        threadId: string
      }

      export function selectThread(source: ThreadTarget, target: ThreadTarget) {
        const { threadId: _threadId } = source
        const { threadId } = target
        const previousThreadId = _threadId

        return { previousThreadId, threadId }
      }

      interface ViewInput {
        /** 展示标签 */
        label: string
        /** 展示状态 */
        status: string
      }

      interface ViewSession {
        /** 是否等待处理 */
        pending: boolean
      }

      export function createViewState(
        options: string[],
        input: ViewInput,
        session?: ViewSession,
      ) {
        const { label, status } = input
        const pending = session?.pending ?? false

        return { options, label, status, pending }
      }

      interface Submitter {
        /** 提交所有者 */
        owner: string
        /** 提交数据 */
        submit: (input: object) => object
      }

      export function submitRequest(
        submitter: Submitter,
        requestId: string,
        userId: string,
        input: string[],
      ) {
        const hidden = createHidden(input)
        const owner = submitter.owner

        return submitter.submit({ requestId, userId, input, hidden, owner })
      }

      function createHidden(input: string[]) {
        return input.length === 0
      }
    `,
  }])).toEqual([])
})

it('真实仓库只报告建议而不加入硬失败预算', () => {
  const sources = readTransformedPropertyShorthandSources()

  expect(() => warnTransformedPropertyShorthand(sources)).not.toThrow()
})
