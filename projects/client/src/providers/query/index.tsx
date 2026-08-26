import type { ClientOptions } from '@socilab/sdk'
import type { ReactNode } from 'react'
import { Client } from '@socilab/sdk'
import { createApiQueryUtils } from '@socilab/sdk/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ClientContext } from './context'

/** -------------------- 类型 -------------------- */
/** 根 Provider 的可注入网络边界 */
export interface ProviderProps extends Partial<ClientOptions> {
  /** 应用路由内容 */
  children: ReactNode
}

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

    return { api: createApiQueryUtils(client) }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext value={value}>{children}</ClientContext>
    </QueryClientProvider>
  )
}

export { useApi } from './hooks'

/** -------------------- 内部函数 -------------------- */
/** 读取客户端服务地址并默认使用当前页面来源 */
function resolveApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin
}
