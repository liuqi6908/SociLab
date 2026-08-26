// @vitest-environment jsdom

import { RouterProvider } from '@tanstack/react-router'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAppRouter, router } from '../../projects/client/src/router'

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

/** 使用入口共享 Router 创建测试应用 */
function App() {
  return <RouterProvider router={router} />
}

describe('client router lifecycle', () => {
  test('使用部署基础路径创建 Router', () => {
    expect(createAppRouter('/learning/').basepath).toBe('/learning/')
  })

  test('app 重渲染时复用同一个 Router 实例', () => {
    const view = render(<App />)

    view.rerender(<App />)

    expect(routers).toHaveLength(2)
    expect(routers[1]).toBe(routers[0])
  })
})
