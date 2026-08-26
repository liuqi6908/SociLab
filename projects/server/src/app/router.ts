import type { ApiContext, ApiHandlers } from '@socilab/api'
import { implement } from '@orpc/server'
import { apiContract } from '@socilab/api'

/** 将模块实现绑定到唯一的共享技术契约 */
export function createApiRouter(handlers: ApiHandlers) {
  const api = implement(apiContract).$context<ApiContext>()

  return api.router({
    meta: {
      info: api.meta.info.handler(({ signal }) => handlers.meta.info({ signal })),
    },
  })
}
