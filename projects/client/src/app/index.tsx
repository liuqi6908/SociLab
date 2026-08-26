import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { createAppRouter } from '../router'

/** -------------------- 核心组件 -------------------- */
/** 装配客户端文件路由 */
export function App() {
  const [router] = useState(createAppRouter)

  return <RouterProvider router={router} />
}
