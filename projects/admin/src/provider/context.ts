import type { Client } from '@socilab/sdk'
import { createContext } from 'react'

/** -------------------- 类型 -------------------- */
interface ClientContextValue {
  /** 绑定当前服务地址的类型化查询能力 */
  api: ReturnType<Client['createApiQueryUtils']>
}

/** -------------------- Context -------------------- */
/** 管理端 Provider 与 Hook 共享的请求能力边界 */
export const ClientContext = createContext<ClientContextValue | undefined>(undefined)
