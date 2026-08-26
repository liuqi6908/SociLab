import type { ContractRouterClient } from '@orpc/contract'
import type { MetaApiHandlers } from './meta/index.ts'
import { metaContract } from './meta/index.ts'

/** -------------------- 类型 -------------------- */
/** 完整 oRPC API 的 Server handler 集合 */
export interface ApiHandlers {
  /** 服务元信息 handler */
  meta: MetaApiHandlers
}

/** -------------------- 契约 -------------------- */
/** 唯一的共享技术契约 */
export const apiContract = {
  meta: metaContract,
}

/** API 客户端的类型化形状 */
export type ApiClient = ContractRouterClient<typeof apiContract>

/** -------------------- 模块出口 -------------------- */
export { apiErrorDataSchema, apiErrorIssueSchema, apiErrors, emptyInputSchema, procedure } from './contract.ts'
export type { ApiContext, ApiHandler, ApiHandlerContext } from './contract.ts'
export { ApiError } from './error/index.ts'
export type { ApiErrorOptions } from './error/index.ts'
export type { MetaApiHandlers } from './meta/index.ts'
export { metaInfoSchema } from './meta/schemas.ts'
export { API_BASE_PATH, API_OPENAPI_PATH, API_RPC_PATH } from './paths/index.ts'
