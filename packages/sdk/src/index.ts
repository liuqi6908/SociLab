import type { ApiClient } from '@socilab/api'
import type { Fetch } from '@socilab/shared'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { API_RPC_PATH } from '@socilab/api'
import { createOrpcClient, createRequest } from '@socilab/request'

/** -------------------- 类型 -------------------- */
/** 创建 SDK 客户端的选项 */
export interface ClientOptions {
  /** 服务基础地址 */
  baseUrl: string
  /** 可注入的网络边界 */
  fetch?: Fetch
}

/** -------------------- 核心类 -------------------- */
/** 客户端和管理端共用的类型化 API SDK */
export class Client {
  /** 规范化后的服务基础地址 */
  public readonly baseUrl: string
  /** 类型化 oRPC API */
  public readonly rpc: ApiClient

  private constructor(options: ClientOptions) {
    const request = createRequest(options)

    this.baseUrl = request.baseUrl
    this.rpc = createOrpcClient<ApiClient>(request, API_RPC_PATH)
  }

  /** 创建共享 SDK 客户端 */
  public static create(options: ClientOptions) {
    return new Client(options)
  }

  /** 创建以当前服务地址隔离缓存键的 TanStack Query utilities */
  public createApiQueryUtils() {
    return createTanstackQueryUtils(this.rpc, { path: [this.baseUrl] })
  }
}
