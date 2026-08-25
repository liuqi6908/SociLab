// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { App } from '../../projects/client/src/app'
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

beforeAll(() => {
  window.scrollTo = () => undefined
})
afterEach(cleanup)
afterAll(() => {
  window.scrollTo = runtimeScrollTo
})

describe('client web shell', () => {
  it('通过真实根路由显示客户端名称', async () => {
    const pending = Promise.withResolvers<Response>()

    render(<App baseUrl="https://client.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'SociLab 客户端' })).toBeInTheDocument()
  })

  it('在 meta.info 尚未返回时显示加载状态', async () => {
    const pending = Promise.withResolvers<Response>()

    render(<App baseUrl="https://client.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('status')).toHaveTextContent('正在连接服务')
  })

  it('在 meta.info 成功后显示服务名称与版本', async () => {
    render(
      <App
        baseUrl="https://client.example.test"
        fetch={() => Promise.resolve(createSuccessResponse())}
      />,
    )

    expect(await screen.findByText('连接成功：SociLab 0.1.0')).toBeInTheDocument()
  })

  it('在 meta.info 失败后显示安全的失败状态', async () => {
    render(
      <App
        baseUrl="https://client.example.test"
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

    render(<App baseUrl="https://client.example.test" fetch={() => pending.promise} />)

    expect(await screen.findByRole('main')).toHaveClass('bg-background', 'text-foreground')
    expect(screen.getByRole('region', { name: '服务连接状态' })).toHaveClass('bg-surface')
  })
})
