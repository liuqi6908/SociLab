import type { metaInfoSchema } from '@socilab/api'
import type { z } from 'zod'

/** -------------------- 类型 -------------------- */
/** 服务元信息 */
export type MetaInfo = z.infer<typeof metaInfoSchema>

/** 元信息 handler 的可替换实现边界 */
export interface MetaHandlersOptions {
  /** 读取服务元信息，默认返回当前固定版本 */
  getInfo?: () => MetaInfo | Promise<MetaInfo>
}

/** 服务元信息 handler */
export interface MetaHandlers {
  /** 读取服务元信息 */
  info: () => MetaInfo | Promise<MetaInfo>
}

/** -------------------- 核心函数 -------------------- */
/** 创建服务元信息 handler */
export function createMetaHandlers(options: MetaHandlersOptions = {}): MetaHandlers {
  return {
    info: options.getInfo ?? getDefaultMetaInfo,
  }
}

/** -------------------- 内部函数 -------------------- */
/** 返回生产环境固定的服务元信息 */
function getDefaultMetaInfo(): MetaInfo {
  return {
    name: 'SociLab',
    version: '0.1.0',
  }
}
