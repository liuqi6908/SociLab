import { createRootRoute, Outlet } from '@tanstack/react-router'

/** -------------------- 路由 -------------------- */
export const Route = createRootRoute({ component: RootRoute })

/** -------------------- 核心组件 -------------------- */
/** 渲染文件路由的根出口 */
function RootRoute() {
  return <Outlet />
}
