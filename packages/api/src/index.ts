import type { ContractRouterClient } from '@orpc/contract'
import { oc } from '@orpc/contract'
import { z } from 'zod'

/** -------------------- 路径常量 -------------------- */
/** HTTP API 统一挂载路径 */
export const API_BASE_PATH = '/api'
/** oRPC 请求入口 */
export const API_RPC_PATH = `${API_BASE_PATH}/rpc`
/** OpenAPI 文档入口 */
export const API_OPENAPI_PATH = `${API_BASE_PATH}/openapi`

/** -------------------- Schema -------------------- */
/** 服务固定元信息的共享 Schema */
export const metaInfoSchema = z.object({
  name: z.literal('SociLab'),
  version: z.literal('0.1.0'),
})

/** 无业务参数 procedure 的输入 Schema */
export const emptyInputSchema = z.object({}).default({})

/** 公共 API 错误结构 */
export const apiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

/** -------------------- 错误 -------------------- */
/** ApiError 的结构化可选信息 */
export interface ApiErrorOptions {
  /** 稳定业务错误码 */
  code?: string
  /** 面向调用方的结构化错误上下文 */
  details?: Record<string, unknown>
  /** 原始异常 */
  cause?: unknown
}

/** 跨 HTTP、oRPC 和 OpenAPI 边界共享的应用错误 */
export class ApiError extends Error {
  /** HTTP 状态码 */
  public readonly status: number
  /** 稳定业务错误码 */
  public readonly code?: string
  /** 面向调用方的结构化错误上下文 */
  public readonly details?: Record<string, unknown>

  public constructor(status: number, message: string, options: ApiErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = status
    this.code = options.code
    this.details = options.details
  }
}

/** -------------------- 契约 -------------------- */
/** 所有 API procedure 共享的 contract builder */
export const procedure = oc

/** 唯一的共享技术契约 */
export const apiContract = {
  meta: {
    info: procedure
      .route({ method: 'GET', path: '/meta/info', summary: '读取服务信息', tags: ['Meta'] })
      .input(emptyInputSchema)
      .output(metaInfoSchema),
  },
}

/** API 客户端的类型化形状 */
export type ApiClient = ContractRouterClient<typeof apiContract>
