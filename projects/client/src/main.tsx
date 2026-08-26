import { ApiProvider } from '@socilab/sdk/react'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { router } from './router'
import './styles/index.css'

/** -------------------- 应用入口 -------------------- */
const root = document.querySelector('#root')

if (!root)
  throw new Error('缺少客户端根节点')

createRoot(root).render(
  <StrictMode>
    <ApiProvider>
      <RouterProvider router={router} />
    </ApiProvider>
  </StrictMode>,
)
