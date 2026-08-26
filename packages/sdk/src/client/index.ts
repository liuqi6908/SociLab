import type { ApiClient } from '@socilab/api'
import type { ClientOptions } from '../types/index.ts'
import { API_RPC_PATH } from '@socilab/api'
import { createOrpcClient, createRequest } from '@socilab/request'

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
}
