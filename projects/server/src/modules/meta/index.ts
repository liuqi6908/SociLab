import type { metaInfoSchema } from '@socilab/api'
import type { z } from 'zod'

/** 服务元信息 */
export type MetaInfo = z.infer<typeof metaInfoSchema>

/** 元信息模块可替换的实现边界 */
export interface MetaModuleOptions {
  /** 读取服务元信息，默认返回当前固定版本 */
  getInfo?: () => MetaInfo | Promise<MetaInfo>
}

/** 服务元信息模块 */
export interface MetaModule {
  /** 读取服务元信息 */
  getInfo: () => MetaInfo | Promise<MetaInfo>
}

/** 创建服务元信息模块 */
export function createMetaModule(options: MetaModuleOptions = {}): MetaModule {
  return {
    getInfo: options.getInfo ?? getDefaultMetaInfo,
  }
}

/** 返回生产环境固定的服务元信息 */
function getDefaultMetaInfo(): MetaInfo {
  return {
    name: 'SociLab',
    version: '0.1.0',
  }
}
