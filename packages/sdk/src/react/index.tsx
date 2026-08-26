import type { ReactNode } from 'react'
import type { ClientOptions } from '../types/index.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Client } from '../client/index.ts'
import { createApiQueryUtils } from '../query/index.ts'
import { ClientContext } from './context.ts'

/** -------------------- 类型 -------------------- */
/** React SDK Provider 的可注入网络边界 */
export interface ApiProviderProps extends Partial<ClientOptions> {
  /** 应用内容 */
  children: ReactNode
}

/** -------------------- 核心组件 -------------------- */
/** 为 React 应用提供隔离的 Query 缓存与共享 SDK */
export function ApiProvider({ baseUrl, children, fetch }: ApiProviderProps) {
  const [queryClient] = useState(() => new QueryClient())
  const [value] = useState(() => {
    const sdk = Client.create({ baseUrl: baseUrl ?? '', fetch })
    const api = createApiQueryUtils(sdk)

    return { api, sdk }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext value={value}>{children}</ClientContext>
    </QueryClientProvider>
  )
}

export { useApi, useClient } from './hooks.ts'
