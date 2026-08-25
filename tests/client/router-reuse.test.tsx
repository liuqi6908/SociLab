// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../projects/client/src/app'

/** 捕获 App 交给真实 TanStack Router Provider 的 Router 实例 */
const routers = vi.hoisted(() => [] as object[])

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  /** 记录 App 提交给框架边界的真实 Router */
  function RouterProvider({ router }: { router: object }) {
    routers.push(router)
    return null
  }

  return {
    ...actual,
    RouterProvider,
  }
})

afterEach(() => {
  cleanup()
  routers.length = 0
})

describe('client router lifecycle', () => {
  it('app 重渲染时复用同一个 Router 实例', () => {
    const view = render(<App baseUrl="https://client.example.test" />)

    view.rerender(<App baseUrl="https://client.example.test" />)

    expect(routers).toHaveLength(2)
    expect(routers[1]).toBe(routers[0])
  })
})
