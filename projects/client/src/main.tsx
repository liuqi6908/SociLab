import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'

/** -------------------- 应用入口 -------------------- */
const root = document.querySelector('#root')

if (!root)
  throw new Error('缺少客户端根节点')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
