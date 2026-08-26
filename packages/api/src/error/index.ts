/** -------------------- 类型 -------------------- */
/** ApiError 的结构化可选信息 */
export interface ApiErrorOptions {
  /** 稳定业务错误码 */
  code?: string
  /** 面向调用方的结构化错误上下文 */
  details?: Record<string, unknown>
  /** 原始异常 */
  cause?: unknown
}

/** -------------------- 核心类 -------------------- */
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
