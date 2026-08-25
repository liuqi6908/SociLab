// @vitest-environment jsdom

import { useQueryClient } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from '../../projects/admin/src/app'
import { Provider, useApi } from '../../projects/admin/src/provider'
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

beforeAll(() => {
  window.scrollTo = () => undefined
})
afterEach(cleanup)
afterAll(() => {
  window.scrollTo = runtimeScrollTo
})

describe('admin web shell', () => {
  it('通过真实根路由显示管理端名称', async () => {
    const pending = Promise.withResolvers<Response>()

    render(<App baseUrl="https://admin.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'SociLab 管理端' })).toBeInTheDocument()
  })

  it('在 meta.info 尚未返回时显示加载状态', async () => {
    const pending = Promise.withResolvers<Response>()

    render(<App baseUrl="https://admin.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('status')).toHaveTextContent('正在连接服务')
  })

  it('在 meta.info 成功后显示服务名称与版本', async () => {
    render(
      <App
        baseUrl="https://admin.example.test"
        fetch={() => Promise.resolve(createSuccessResponse())}
      />,
    )

    expect(await screen.findByText('连接成功：SociLab 0.1.0')).toBeInTheDocument()
  })

  it('以相同 props 重渲染时复用 QueryClient 与 SDK 查询能力', () => {
    const instances: ProviderInstance[] = []
    const fetch = () => Promise.resolve(createSuccessResponse())
    const view = render(
      <Provider baseUrl="https://admin.example.test" fetch={fetch}>
        <LifecycleProbe instances={instances} />
      </Provider>,
    )

    view.rerender(
      <Provider baseUrl="https://admin.example.test" fetch={fetch}>
        <LifecycleProbe instances={instances} />
      </Provider>,
    )

    expect(instances).toHaveLength(2)
    expect(instances[1]?.queryClient).toBe(instances[0]?.queryClient)
    expect(instances[1]?.api).toBe(instances[0]?.api)
  })

  it('以相同 props 重渲染成功页面时不重复请求 meta.info', async () => {
    const fetch = vi.fn(() => Promise.resolve(createSuccessResponse()))
    const view = render(<App baseUrl="https://admin.example.test" fetch={fetch} />)

    expect(await screen.findByText('连接成功：SociLab 0.1.0')).toBeInTheDocument()
    view.rerender(<App baseUrl="https://admin.example.test" fetch={fetch} />)

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  })

  it('在 meta.info 失败后显示安全的失败状态', async () => {
    render(
      <App
        baseUrl="https://admin.example.test"
        fetch={() => Promise.resolve(new Response(JSON.stringify({
          code: 'INTERNAL_SERVER_ERROR',
          message: '服务器内部错误',
        }), {
          headers: { 'content-type': 'application/json' },
          status: 500,
        }))}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('连接失败')
    expect(screen.queryByText('服务器内部错误')).not.toBeInTheDocument()
  })

  it('消费共享主题的页面、前景和表面语义色', async () => {
    const pending = Promise.withResolvers<Response>()

    render(<App baseUrl="https://admin.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('main')).toHaveClass('bg-background', 'text-foreground')
    expect(screen.getByRole('region', { name: '服务连接状态' })).toHaveClass('bg-surface')
  })
})
