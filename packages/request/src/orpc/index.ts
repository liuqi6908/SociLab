import type { NestedClient } from '@orpc/client'
import type { RequestClient } from '../core/index.ts'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

/** -------------------- 核心函数 -------------------- */
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
