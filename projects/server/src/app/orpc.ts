import type { AnyRouter } from '@orpc/server'
import type { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { RPCHandler } from '@orpc/server/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { API_OPENAPI_PATH, API_RPC_PATH, apiErrorSchema } from '@socilab/api'

/** 在 Hono 挂载同一 router 的 RPC 和 OpenAPI 协议 */
export function registerApiProtocols(app: Hono, router: AnyRouter) {
  const rpcHandler = new RPCHandler(router)
  const openapiHandler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        docsPath: '/docs',
        docsTitle: 'SociLab API',
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title: 'SociLab API', version: '0.1.0' },
        },
        specPath: '/spec.json',
      }),
    ],
  })

  app.all(API_RPC_PATH, context => handleRpcRequest(context.req.raw, rpcHandler))
  app.all(`${API_RPC_PATH}/*`, context => handleRpcRequest(context.req.raw, rpcHandler))
  app.all(API_OPENAPI_PATH, context => handleOpenApiRequest(context.req.raw, openapiHandler))
  app.all(`${API_OPENAPI_PATH}/*`, context => handleOpenApiRequest(context.req.raw, openapiHandler))
}

/** 将 RPC adapter 的错误响应收敛为公共错误结构 */
async function handleRpcRequest(request: Request, handler: RPCHandler<Record<never, never>>) {
  const result = await handler.handle(request, { prefix: API_RPC_PATH })

  return result.response && await normalizeProtocolResponse(result.response)
}

/** 将 OpenAPI adapter 的错误响应收敛为公共错误结构 */
async function handleOpenApiRequest(request: Request, handler: OpenAPIHandler<Record<never, never>>) {
  const result = await handler.handle(request, { prefix: API_OPENAPI_PATH })

  return result.response && await normalizeProtocolResponse(result.response)
}

/** 从 oRPC 错误响应提取公共错误字段 */
export async function normalizeProtocolResponse(response: Response) {
  if (response.status < 400)
    return response

  const contentType = response.headers.get('content-type')
  const source = contentType?.includes('application/json')
    ? await response.json().catch(() => undefined)
    : undefined
  const envelope = isRecord(source) ? source : undefined
  const record = isRecord(envelope?.json) ? envelope.json : envelope
  const data = isRecord(record?.data) ? record.data : undefined
  const details = isRecord(data?.details)
    ? data.details
    : Array.isArray(data?.issues)
      ? { issues: data.issues }
      : undefined
  const body = apiErrorSchema.parse({
    message: typeof record?.message === 'string' ? record.message : '服务器内部错误',
    code: typeof data?.code === 'string'
      ? data.code
      : typeof record?.code === 'string'
        ? record.code
        : undefined,
    details,
  })

  return Response.json(body, {
    headers: createErrorResponseHeaders(response.headers),
    status: response.status,
  })
}

/** 保留传输语义头，同时移除已经绑定旧实体的响应头 */
function createErrorResponseHeaders(source: Headers) {
  const headers = new Headers(source)

  for (const name of ['content-encoding', 'content-length', 'content-md5', 'content-range', 'digest', 'etag', 'last-modified'])
    headers.delete(name)

  return headers
}

/** 收窄未知 JSON 值为记录 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
