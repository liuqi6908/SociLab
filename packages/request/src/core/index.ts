import type { Fetch } from '@socilab/shared'
import type { HttpErrorIssue } from '../error/index.ts'
import { isPlainRecord, jsonParse } from '@socilab/shared'
import { HttpError } from '../error/index.ts'

/** -------------------- 类型 -------------------- */
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
  const fallbackMessage = `HTTP ${response.status}`
  const details = isPlainRecord(record?.details) ? record.details : undefined
  const issueSource = Array.isArray(details?.issues)
    ? details.issues
    : Array.isArray(record?.issues)
      ? record.issues
      : undefined
  const issues = issueSource
    ? issueSource.filter(isHttpErrorIssue)
    : undefined

  return new HttpError({
    status: response.status,
    message: typeof record?.message === 'string'
      ? record.message
      : typeof record?.error === 'string'
        ? record.error
        : record || looksLikeJson(text)
          ? fallbackMessage
          : text || response.statusText || fallbackMessage,
    code: typeof record?.code === 'string' ? record.code : undefined,
    details,
    issues,
  })
}

/** 判断错误体是否意图为 JSON，解析失败时不将语法碎片泄露为错误消息 */
function looksLikeJson(value: string) {
  return /^[{[]/.test(value.trimStart())
}

/** 确认错误数组成员可以作为公共输入问题暴露 */
function isHttpErrorIssue(value: unknown): value is HttpErrorIssue {
  return isPlainRecord(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.path === 'string'
}
