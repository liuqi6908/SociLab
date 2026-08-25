import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/** -------------------- 核心函数 -------------------- */
/** 为当前应用实例创建文件路由器 */
export function createAppRouter() {
  return createRouter({ routeTree })
}

/** -------------------- 类型注册 -------------------- */
export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
