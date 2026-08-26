// @vitest-environment jsdom

import { ApiProvider as Provider, useApi } from '@socilab/sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { createAppRouter } from '../../projects/client/src/router'
import '@testing-library/jest-dom/vitest'

/** -------------------- 测试工具 -------------------- */
function createSuccessResponse() {
  return new Response(JSON.stringify({
    json: {
      name: 'SociLab',
      version: '0.1.0',
    },
  }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

/** 使用客户端真实路由创建测试应用 */
function App() {
  return <RouterProvider router={createAppRouter()} />
}

/** 使用真实根 Provider 渲染客户端应用 */
function renderApp(options: Omit<Parameters<typeof Provider>[0], 'children'> = {}) {
  return render(
    <Provider {...options}>
      <App />
    </Provider>,
  )
}

const runtimeScrollTo = window.scrollTo

type ProviderInstance = Readonly<{
  api: ReturnType<typeof useApi>
  queryClient: ReturnType<typeof useQueryClient>
}>

function LifecycleProbe({ instances }: { instances: ProviderInstance[] }) {
  const queryClient = useQueryClient()
  const api = useApi()

  instances.push({ api, queryClient })
  return null
}

/** 验证 useApi 的 Provider 边界 */
function ApiProbe() {
  useApi()
  return null
}

beforeAll(() => {
  window.scrollTo = () => undefined
})
afterEach(cleanup)
afterAll(() => {
  window.scrollTo = runtimeScrollTo
})

describe('client web shell', () => {
  test('通过真实根路由显示客户端名称', async () => {
    const pending = Promise.withResolvers<Response>()

    renderApp({ baseUrl: 'https://client.example.test', fetch: () => pending.promise })

    expect(await screen.findByRole('heading', { level: 1, name: 'SociLab 客户端' })).toBeInTheDocument()
  })

  test('在 meta.info 尚未返回时显示加载状态', async () => {
    const pending = Promise.withResolvers<Response>()

    renderApp({ baseUrl: 'https://client.example.test', fetch: () => pending.promise })

    expect(await screen.findByRole('status')).toHaveTextContent('正在连接服务')
  })

  test('在 meta.info 成功后显示服务名称与版本', async () => {
    renderApp({
      baseUrl: 'https://client.example.test',
      fetch: () => Promise.resolve(createSuccessResponse()),
    })

    expect(await screen.findByText('连接成功：SociLab 0.1.0')).toBeInTheDocument()
  })

  test('未显式配置服务地址时使用当前页面 origin', async () => {
    let requestUrl = ''

    renderApp({
      fetch: (input, init) => {
        requestUrl = new Request(input, init).url
        return Promise.resolve(createSuccessResponse())
      },
    })

    await waitFor(() => expect(requestUrl).toBe(`${window.location.origin}/api/rpc/meta/info`))
  })

  test('在 Provider 外调用 useApi 时提供明确错误边界', () => {
    expect(() => render(<ApiProbe />)).toThrow('请求能力必须在 ApiProvider 内使用')
  })

  test('以相同 props 重渲染时复用 QueryClient 与 SDK 查询能力', () => {
    const instances: ProviderInstance[] = []
    const fetch = () => Promise.resolve(createSuccessResponse())
    const view = render(
      <Provider baseUrl="https://client.example.test" fetch={fetch}>
        <LifecycleProbe instances={instances} />
      </Provider>,
    )

    view.rerender(
      <Provider baseUrl="https://client.example.test" fetch={fetch}>
        <LifecycleProbe instances={instances} />
      </Provider>,
    )

    expect(instances).toHaveLength(2)
    expect(instances[1]?.queryClient).toBe(instances[0]?.queryClient)
    expect(instances[1]?.api).toBe(instances[0]?.api)
  })

  test('以相同 props 重渲染成功页面时不重复请求 meta.info', async () => {
    const fetch = vi.fn(() => Promise.resolve(createSuccessResponse()))
    const view = renderApp({ baseUrl: 'https://client.example.test', fetch })

    expect(await screen.findByText('连接成功：SociLab 0.1.0')).toBeInTheDocument()
    view.rerender(
      <Provider baseUrl="https://client.example.test" fetch={fetch}>
        <App />
      </Provider>,
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  })

  test('在 meta.info 失败后显示安全的失败状态', async () => {
    renderApp({
      baseUrl: 'https://client.example.test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        json: {
          code: 'INTERNAL_SERVER_ERROR',
          defined: true,
          message: '服务器内部错误',
          status: 500,
        },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 500,
      })),
    })

    expect(
      await screen.findByRole('alert', undefined, { timeout: 12_000 }),
    ).toHaveTextContent('连接失败')
    expect(screen.queryByText('服务器内部错误')).not.toBeInTheDocument()
  }, 15_000)
})
