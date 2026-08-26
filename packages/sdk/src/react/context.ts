import type { Client } from '../client/index.ts'
import type { ApiQueryUtils } from '../query/index.ts'
import { createContext } from 'react'

/** -------------------- 类型 -------------------- */
/** React 应用共享的 SDK 与 Query utilities */
export interface ClientContextValue {
  /** 类型化 API Query utilities */
  api: ApiQueryUtils
  /** 当前服务的 SDK 客户端 */
  sdk: Client
}

/** -------------------- Context -------------------- */
/** React 应用绑定的请求客户端 */
export const ClientContext = createContext<ClientContextValue | undefined>(undefined)
