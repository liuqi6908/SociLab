import type { AnySchema, InferSchemaInput, InferSchemaOutput } from '@orpc/contract'
import type { Promisable } from '@socilab/shared'
import { oc } from '@orpc/contract'
import { z } from 'zod'

/** -------------------- Schema -------------------- */
/** API 输入校验问题 */
export const apiErrorIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string(),
})

/** API 错误附带的类型化数据 */
export const apiErrorDataSchema = z.object({
  businessCode: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  issues: apiErrorIssueSchema.array().optional(),
}).optional()

/** 无业务参数 procedure 的输入 Schema */
export const emptyInputSchema = z.strictObject({}).default({})

/** -------------------- 类型 -------------------- */
/** 单次 oRPC 请求向 procedure 暴露的最小上下文 */
export interface ApiContext {
  /** 当前请求完整地址 */
  requestUrl: string
  /** 网络 handler 可选注入的响应头 */
  resHeaders?: Headers
}

/** procedure handler 接收的传输无关请求上下文 */
export interface ApiHandlerContext {
  /** 请求中止信号 */
  signal?: AbortSignal
}

/** 从输入输出 Schema 推导传输无关的 procedure handler */
export type ApiHandler<
  TOutputSchema extends AnySchema,
  TInputSchema extends AnySchema | undefined = undefined,
> = (
  ...args: TInputSchema extends AnySchema
    ? [input: InferSchemaOutput<TInputSchema>, context: ApiHandlerContext]
    : [context: ApiHandlerContext]
) => Promisable<InferSchemaInput<TOutputSchema>>

/** -------------------- 契约 -------------------- */
/** 所有领域 procedure 共享的类型化错误 */
export const apiErrors = {
  BAD_REQUEST: { data: apiErrorDataSchema },
  UNAUTHORIZED: { data: apiErrorDataSchema },
  FORBIDDEN: { data: apiErrorDataSchema },
  NOT_FOUND: { data: apiErrorDataSchema },
  TIMEOUT: { data: apiErrorDataSchema },
  CONFLICT: { data: apiErrorDataSchema },
  PRECONDITION_FAILED: { data: apiErrorDataSchema },
  PAYLOAD_TOO_LARGE: { data: apiErrorDataSchema },
  UNPROCESSABLE_CONTENT: { data: apiErrorDataSchema },
  TOO_MANY_REQUESTS: { data: apiErrorDataSchema },
  CLIENT_CLOSED_REQUEST: { data: apiErrorDataSchema },
  INTERNAL_SERVER_ERROR: { data: apiErrorDataSchema },
  NOT_IMPLEMENTED: { data: apiErrorDataSchema },
  SERVICE_UNAVAILABLE: { data: apiErrorDataSchema },
} as const

/** 所有 API procedure 共享的 contract builder */
export const procedure = oc.errors(apiErrors)
