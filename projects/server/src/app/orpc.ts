import type { AnyRouter } from '@orpc/server'
import type { ApiContext } from '@socilab/api'
import type { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { ORPCError, os, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { BatchHandlerPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { API_OPENAPI_PATH, API_RPC_PATH, ApiError } from '@socilab/api'

/** -------------------- 类型 -------------------- */
/** 同一个 Router 暴露的 RPC 与 OpenAPI handler */
export interface ApiProtocolHandlers {
  /** oRPC 原生协议 handler */
  rpc: RPCHandler<ApiContext>
  /** OpenAPI 与 Scalar handler */
  openapi: OpenAPIHandler<ApiContext>
}

/** -------------------- 中间件 -------------------- */
/** 将业务错误和输入校验统一收口到 oRPC 协议边界 */
const apiMiddleware = os.$context<ApiContext>().middleware(async ({ next }) => {
  try {
    return await next()
  }
  catch (cause) {
    if (cause instanceof ApiError)
      throw createApiProtocolError(cause)

    if (
      cause instanceof ORPCError
      && cause.code === 'BAD_REQUEST'
      && cause.cause instanceof ValidationError
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message: cause.message,
        data: { issues: createValidationIssues(cause.cause) },
        cause,
      })
    }

    if (cause instanceof ORPCError && cause.status < 500)
      throw cause

    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: '服务器内部错误',
      cause,
    })
  }
})

/** -------------------- 核心函数 -------------------- */
/** 为单个 Router 创建共享实现的 RPC 与 OpenAPI handler */
export function createApiProtocolHandlers(
  router: AnyRouter,
  title: string,
): ApiProtocolHandlers {
  const protocolRouter = applyApiMiddleware(router)
  const rpc = new RPCHandler(protocolRouter, {
    plugins: [
      new BatchHandlerPlugin({ maxSize: 10 }),
      new ResponseHeadersPlugin(),
    ],
  })
  const openapi = new OpenAPIHandler(protocolRouter, {
    plugins: [
      new ResponseHeadersPlugin(),
      new OpenAPIReferencePlugin({
        docsPath: '/docs',
        docsTitle: title,
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title, version: '0.1.0' },
        },
        specPath: '/spec.json',
      }),
    ],
  })

  return { openapi, rpc }
}

/** 为网络 adapter 应用统一错误边界 */
export function applyApiMiddleware<TRouter extends AnyRouter>(router: TRouter) {
  return os.$context<ApiContext>().use(apiMiddleware).router(router)
}

/** 在 Hono 挂载同一 router 的 RPC 和 OpenAPI 协议 */
export function registerApiProtocols(app: Hono, router: AnyRouter) {
  const handlers = createApiProtocolHandlers(router, 'SociLab API')

  app.all(API_RPC_PATH, context => handleRequest(context.req.raw, handlers.rpc, API_RPC_PATH))
  app.all(`${API_RPC_PATH}/*`, context => handleRequest(context.req.raw, handlers.rpc, API_RPC_PATH))
  app.all(API_OPENAPI_PATH, context => handleRequest(context.req.raw, handlers.openapi, API_OPENAPI_PATH))
  app.all(`${API_OPENAPI_PATH}/*`, context => handleRequest(context.req.raw, handlers.openapi, API_OPENAPI_PATH))
}

/** -------------------- 内部函数 -------------------- */
/** 将协议请求交给共享 handler */
async function handleRequest(
  request: Request,
  handler: RPCHandler<ApiContext> | OpenAPIHandler<ApiContext>,
  prefix: `/${string}`,
) {
  const result = await handler.handle(request, {
    prefix,
    context: { requestUrl: request.url },
  })

  return result.response
}

/** 将应用错误转换为标准 oRPC 错误 */
function createApiProtocolError(cause: ApiError) {
  return new ORPCError(resolveApiErrorCode(cause.status), {
    status: cause.status,
    message: cause.message,
    data: {
      businessCode: cause.code,
      details: cause.details,
    },
    cause,
  })
}

/** 将校验库问题转换为稳定客户端结构 */
function createValidationIssues(error: ValidationError) {
  return error.issues.map(issue => ({
    code: 'validation',
    message: issue.message,
    path: issue.path?.map(String).join('.') ?? '',
  }))
}

/** 将 HTTP 语义状态映射为 oRPC 标准错误码 */
function resolveApiErrorCode(status: number) {
  if (status === 400)
    return 'BAD_REQUEST' as const
  if (status === 401)
    return 'UNAUTHORIZED' as const
  if (status === 403)
    return 'FORBIDDEN' as const
  if (status === 404)
    return 'NOT_FOUND' as const
  if (status === 408 || status === 504)
    return 'TIMEOUT' as const
  if (status === 409)
    return 'CONFLICT' as const
  if (status === 412)
    return 'PRECONDITION_FAILED' as const
  if (status === 413)
    return 'PAYLOAD_TOO_LARGE' as const
  if (status === 422)
    return 'UNPROCESSABLE_CONTENT' as const
  if (status === 429)
    return 'TOO_MANY_REQUESTS' as const
  if (status === 499)
    return 'CLIENT_CLOSED_REQUEST' as const
  if (status === 501)
    return 'NOT_IMPLEMENTED' as const
  if (status === 503)
    return 'SERVICE_UNAVAILABLE' as const

  return 'INTERNAL_SERVER_ERROR' as const
}
