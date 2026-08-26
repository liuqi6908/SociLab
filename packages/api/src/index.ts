import type { ContractRouterClient } from '@orpc/contract'
import { metaContract } from './meta/index.ts'

/** -------------------- 契约 -------------------- */
/** 唯一的共享技术契约 */
export const apiContract = {
  meta: metaContract,
}

/** API 客户端的类型化形状 */
export type ApiClient = ContractRouterClient<typeof apiContract>

/** -------------------- 模块出口 -------------------- */
export { apiErrorSchema, emptyInputSchema, procedure } from './contract.ts'
export { ApiError } from './error/index.ts'
export type { ApiErrorOptions } from './error/index.ts'
export { metaInfoSchema } from './meta/schemas.ts'
export { API_BASE_PATH, API_OPENAPI_PATH, API_RPC_PATH } from './paths/index.ts'
