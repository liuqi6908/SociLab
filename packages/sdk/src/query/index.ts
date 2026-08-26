import type { Client } from '../client/index.ts'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

/** -------------------- 类型 -------------------- */
/** Query 聚合器所需的最小类型化客户端 */
export type QueryApi = Pick<Client, 'baseUrl' | 'rpc'>

/** 服务 API 的框架无关 TanStack Query utilities */
export type ApiQueryUtils = ReturnType<typeof createApiQueryUtils>

/** -------------------- 核心函数 -------------------- */
/** 创建以当前服务地址隔离缓存键的 TanStack Query utilities */
export function createApiQueryUtils(client: QueryApi) {
  return createTanstackQueryUtils(client.rpc, { path: [client.baseUrl] })
}
