import { use } from 'react'
import { ClientContext } from './context'

/** -------------------- Hooks -------------------- */
/** 读取根 Provider 初始化的类型化查询能力 */
export function useApi() {
  const value = use(ClientContext)

  if (!value)
    throw new Error('管理端请求能力必须在 Provider 内使用')

  return value.api
}
