import type { ClientOptions } from '@socilab/sdk'
import type { ReactNode } from 'react'
import { Client } from '@socilab/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, use, useState } from 'react'

/** -------------------- 类型 -------------------- */
interface ClientContextValue {
  /** 绑定当前服务地址的类型化查询能力 */
  api: ReturnType<Client['createApiQueryUtils']>
}

/** 根 Provider 的可注入网络边界 */
export interface ProviderProps extends Partial<ClientOptions> {
  /** 应用路由内容 */
  children: ReactNode
}

/** -------------------- Context -------------------- */
const ClientContext = createContext<ClientContextValue | undefined>(undefined)

/** -------------------- 核心组件 -------------------- */
/** 为客户端路由提供隔离的 Query 缓存与共享 SDK */
export function Provider({ baseUrl, children, fetch }: ProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }))
  const [value] = useState(() => {
    const client = Client.create({
      baseUrl: baseUrl ?? resolveApiBaseUrl(),
      fetch,
    })

    return { api: client.createApiQueryUtils() }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext value={value}>{children}</ClientContext>
    </QueryClientProvider>
  )
}

/** -------------------- Hooks -------------------- */
/** 读取根 Provider 初始化的类型化查询能力 */
export function useApi() {
  const value = use(ClientContext)

  if (!value)
    throw new Error('客户端请求能力必须在 Provider 内使用')

  return value.api
}

/** -------------------- 内部函数 -------------------- */
/** 生产环境默认同源，仅接受非空显式覆盖 */
function resolveApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin
}
