import type { NestedClient } from '@orpc/client'
import type { Fetch, UnknownRecord } from '@socilab/shared'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { isPlainRecord, jsonParse } from '@socilab/shared'

/** -------------------- 类型 -------------------- */
/** 输入校验问题 */
export interface HttpErrorIssue {
  /** 校验器错误码 */
  code: string
  /** 可读错误信息 */
  message: string
  /** 输入字段路径 */
  path: string
}

/** HttpError 的初始化数据 */
export interface HttpErrorInput {
  /** HTTP 状态码 */
  status: number
  /** 可读错误信息 */
  message: string
  /** 稳定业务错误码 */
  code?: string
  /** 结构化错误上下文 */
  details?: UnknownRecord
  /** 输入校验问题 */
  issues?: HttpErrorIssue[]
}

/** 创建统一请求边界的选项 */
export interface CreateRequestOptions {
  /** 服务基础地址 */
  baseUrl: string
  /** 可注入的网络边界 */
  fetch?: Fetch
}

/** 绑定基础地址且统一错误的请求能力 */
export interface RequestClient {
  /** 规范化后的基础地址 */
  readonly baseUrl: string
  /** 保留成功响应的 Fetch */
  readonly fetch: Fetch
}

/** -------------------- 错误 -------------------- */
/** 非成功 HTTP 响应的统一错误 */
export class HttpError extends Error {
  /** HTTP 状态码 */
  public readonly status: number
  /** 稳定业务错误码 */
  public readonly code?: string
  /** 结构化错误上下文 */
  public readonly details?: UnknownRecord
  /** 输入校验问题 */
  public readonly issues?: HttpErrorIssue[]

  public constructor(input: HttpErrorInput) {
    super(input.message)
    this.name = 'HttpError'
    this.status = input.status
    this.code = input.code
    this.details = input.details
    this.issues = input.issues
  }
}

/** -------------------- 核心函数 -------------------- */
/** 创建绑定基础地址的标准请求能力 */
export function createRequest(options: CreateRequestOptions): RequestClient {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const runtimeFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))

  const fetch: Fetch = async (input, init) => {
    const response = await runtimeFetch(createRequestInput(baseUrl, input, init))

    if (!response.ok)
      throw await toHttpError(response)

    return response
  }

  return { baseUrl, fetch }
}

/** 使用统一请求能力创建类型化 oRPC 客户端 */
export function createOrpcClient<TClient extends NestedClient<Record<never, never>>>(
  request: RequestClient,
  rpcPath: string,
) {
  return createORPCClient<TClient>(new RPCLink({
    url: new URL(rpcPath.replace(/^\/+/, ''), `${request.baseUrl}/`).toString(),
    fetch: request.fetch,
  }))
}

/** -------------------- 内部函数 -------------------- */
/** 解析并标准化绝对基础地址 */
function resolveBaseUrl(baseUrl: string) {
  return new URL(baseUrl).toString().replace(/\/+$/, '')
}

/** 将相对路径绑定到基础地址，绝对 Fetch 输入保持原语义 */
function createRequestInput(baseUrl: string, input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input === 'string' && !URL.canParse(input))
    return new Request(new URL(input.replace(/^\/+/, ''), `${baseUrl}/`), init)

  return new Request(input, init)
}

/** 将 JSON 与非 JSON 错误响应归一化 */
async function toHttpError(response: Response) {
  const text = await response.text()
  const body = jsonParse(text)
  const record = isPlainRecord(body) ? body : undefined
  const issues = Array.isArray(record?.issues)
    ? record.issues.filter(isHttpErrorIssue)
    : undefined

  return new HttpError({
    status: response.status,
    message: typeof record?.message === 'string'
      ? record.message
      : typeof record?.error === 'string'
        ? record.error
        : text || response.statusText,
    code: typeof record?.code === 'string' ? record.code : undefined,
    details: isPlainRecord(record?.details) ? record.details : undefined,
    issues,
  })
}

/** 确认错误数组成员可以作为公共输入问题暴露 */
function isHttpErrorIssue(value: unknown): value is HttpErrorIssue {
  return isPlainRecord(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.path === 'string'
}
