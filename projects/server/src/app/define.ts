import type { MetaHandlersOptions } from '../modules/meta/handlers.js'
import { API_BASE_PATH } from '@socilab/api'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMetaHandlers } from '../modules/meta/handlers.js'
import { registerApiProtocols } from './orpc.js'
import { createApiRouter } from './router.js'

/** -------------------- 类型 -------------------- */
/** 创建内存 Hono 服务的选项 */
export interface CreateAppOptions {
  /** 允许浏览器访问 API 的 Origin */
  corsOrigins?: string[]
  /** 元信息 handler 的可替换实现 */
  meta?: MetaHandlersOptions
}

/** -------------------- 核心函数 -------------------- */
/** 创建只暴露共享技术 API 的 Hono 服务 */
export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono()
  const corsOrigins = options.corsOrigins ?? []

  if (corsOrigins.length > 0) {
    app.use(`${API_BASE_PATH}/*`, cors({
      allowHeaders: ['Content-Type'],
      origin: corsOrigins,
    }))
  }

  const router = createApiRouter({
    meta: createMetaHandlers(options.meta),
  })

  registerApiProtocols(app, router)
  return app
}
