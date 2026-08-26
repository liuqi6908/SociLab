import type { Fetch } from '@socilab/shared'

/** -------------------- 类型 -------------------- */
/** 创建 SDK 客户端的选项 */
export interface ClientOptions {
  /** 服务基础地址 */
  baseUrl: string
  /** 可注入的网络边界 */
  fetch?: Fetch
}
