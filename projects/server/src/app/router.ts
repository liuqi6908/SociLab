import type { MetaModule } from '../modules/index.js'
import { implement, ORPCError, os, ValidationError } from '@orpc/server'
import { apiContract, ApiError } from '@socilab/api'

/** 创建 API router 的依赖 */
export interface CreateApiRouterOptions {
  /** 服务元信息模块 */
  meta: MetaModule
}

/** 统一 API 错误边界 */
const errorBoundary = os.middleware(async ({ next }) => {
  try {
    return await next()
  }
  catch (error) {
    if (error instanceof ApiError) {
      throw new ORPCError(resolveErrorCode(error.status), {
        status: error.status,
        message: error.message,
        data: {
          code: error.code,
          details: error.details,
        },
        cause: error,
      })
    }

    if (
      error instanceof ORPCError
      && error.code === 'BAD_REQUEST'
      && error.cause instanceof ValidationError
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message: error.message,
        data: {
          issues: error.cause.issues.map(issue => ({
            code: 'validation',
            message: issue.message,
            path: issue.path?.map(String).join('.') ?? '',
          })),
        },
        cause: error,
      })
    }

    if (error instanceof ORPCError && error.status < 500)
      throw error

    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: '服务器内部错误',
    })
  }
})

/** 将模块实现绑定到唯一的共享技术契约 */
export function createApiRouter(options: CreateApiRouterOptions) {
  const api = implement(apiContract).use(errorBoundary)

  return api.router({
    meta: {
      info: api.meta.info.handler(() => options.meta.getInfo()),
    },
  })
}

/** 将 HTTP 状态语义转换为 oRPC 错误码 */
function resolveErrorCode(status: number) {
  if (status === 400)
    return 'BAD_REQUEST' as const
  if (status === 401)
    return 'UNAUTHORIZED' as const
  if (status === 403)
    return 'FORBIDDEN' as const
  if (status === 404)
    return 'NOT_FOUND' as const
  if (status === 409)
    return 'CONFLICT' as const
  if (status === 422)
    return 'UNPROCESSABLE_CONTENT' as const
  if (status === 429)
    return 'TOO_MANY_REQUESTS' as const
  if (status === 503)
    return 'SERVICE_UNAVAILABLE' as const

  return 'INTERNAL_SERVER_ERROR' as const
}
