import { use } from 'react'
import { ClientContext } from './context.ts'

/** -------------------- Hooks -------------------- */
/** 读取类型化 API Query utilities */
export function useApi() {
  return useClientContext().api
}

/** 读取 SDK 客户端 */
export function useClient() {
  return useClientContext().sdk
}

/** -------------------- 内部函数 -------------------- */
/** 读取已经由 ApiProvider 初始化的请求上下文 */
function useClientContext() {
  const value = use(ClientContext)

  if (!value)
    throw new Error('请求能力必须在 ApiProvider 内使用')
  return value
}
