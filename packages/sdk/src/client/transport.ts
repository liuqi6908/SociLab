import type { ApiClient } from '@socilab/api'
import type { RequestClient } from '@socilab/request'
import { API_RPC_PATH } from '@socilab/api'
import { createOrpcClient } from '@socilab/request'

/** -------------------- 类型 -------------------- */
/** SDK 核心 oRPC client */
export type CoreApiClient = ReturnType<typeof createApiClient>

/** -------------------- 核心函数 -------------------- */
/** 创建绑定 SociLab RPC endpoint 的核心客户端 */
export function createApiClient(request: RequestClient) {
  const transport = request.withBaseUrl(`${request.baseUrl}${API_RPC_PATH}`)

  return createOrpcClient<ApiClient>(transport)
}
