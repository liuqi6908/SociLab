import type { ProviderProps } from './provider'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { Provider } from './provider'
import { createAppRouter } from './router'
import './styles.css'

/** -------------------- 核心组件 -------------------- */
/** 装配管理端真实 Provider 与文件路由 */
export function App(props: Omit<ProviderProps, 'children'>) {
  const [router] = useState(createAppRouter)

  return (
    <Provider {...props}>
      <RouterProvider router={router} />
    </Provider>
  )
}
