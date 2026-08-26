import type { ApiQueryUtils } from '@socilab/sdk/query'
import { createContext } from 'react'

/** -------------------- 类型 -------------------- */
/** 客户端 Provider 与 Hook 共享的请求能力 */
export interface ClientContextValue {
  /** 绑定当前服务地址的类型化查询能力 */
  api: ApiQueryUtils
}

/** -------------------- Context -------------------- */
/** 客户端 Provider 与 Hook 共享的请求能力边界 */
export const ClientContext = createContext<ClientContextValue | undefined>(undefined)
