import { createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

/** -------------------- 核心函数 -------------------- */
/**
 * 使用 Vite 部署基础路径创建文件路由器
 */
export function createAppRouter(basepath = import.meta.env.BASE_URL) {
  return createRouter({ basepath, routeTree })
}

/** -------------------- 类型注册 -------------------- */
/** 当前管理端入口共享的 Router */
export const router = createAppRouter()

export type AppRouter = typeof router

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
