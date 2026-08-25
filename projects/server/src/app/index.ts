import type { MetaModuleOptions } from '../modules/index.js'
import { API_BASE_PATH } from '@socilab/api'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMetaModule } from '../modules/index.js'
import { registerApiProtocols } from './orpc.js'
import { createApiRouter } from './router.js'

/** 创建内存 Hono 服务的选项 */
export interface CreateAppOptions {
  /** 允许浏览器访问 API 的 Origin */
  corsOrigins?: string[]
  /** 元信息模块的可替换实现 */
  meta?: MetaModuleOptions
}

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
    meta: createMetaModule(options.meta),
  })

  registerApiProtocols(app, router)
  return app
}
