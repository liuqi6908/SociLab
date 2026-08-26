// @vitest-environment jsdom

import { ApiProvider, useApi, useClient } from '@socilab/sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

afterEach(cleanup)

/** -------------------- 测试 -------------------- */
test('api provider 重渲染时复用 SDK、API 和 QueryClient', () => {
  const instances: object[][] = []

  /** 收集 Provider 生命周期实例 */
  function Probe() {
    instances.push([useClient(), useApi(), useQueryClient()])
    return null
  }

  const view = render(
    <ApiProvider baseUrl="https://client.example.test"><Probe /></ApiProvider>,
  )

  view.rerender(
    <ApiProvider baseUrl="https://client.example.test"><Probe /></ApiProvider>,
  )

  expect(instances).toHaveLength(2)
  expect(instances[1]).toEqual(instances[0])
})

test('api provider 保留 TanStack Query 默认重试策略', () => {
  let retry: unknown

  /** 读取当前 Query 默认值 */
  function Probe() {
    retry = useQueryClient().getDefaultOptions().queries?.retry
    return null
  }

  render(<ApiProvider baseUrl="https://client.example.test"><Probe /></ApiProvider>)
  expect(retry).toBeUndefined()
})

test('hook 在 Provider 外提供统一错误边界', () => {
  /** 在缺少 Provider 时读取 API */
  function Probe() {
    useApi()
    return null
  }

  expect(() => render(<Probe />)).toThrow('请求能力必须在 ApiProvider 内使用')
})
