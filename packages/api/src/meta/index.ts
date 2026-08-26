import type { ApiHandler } from '../contract.ts'
import { emptyInputSchema, procedure } from '../contract.ts'
import { metaInfoSchema } from './schemas.ts'

/** -------------------- 类型 -------------------- */
/** 服务元信息 procedure handler */
export interface MetaApiHandlers {
  /** 读取服务信息 */
  info: ApiHandler<typeof metaInfoSchema>
}

/** -------------------- 契约 -------------------- */
/** 服务元信息技术契约 */
export const metaContract = {
  info: procedure
    .route({ method: 'GET', path: '/meta/info', summary: '读取服务信息', tags: ['Meta'] })
    .input(emptyInputSchema)
    .output(metaInfoSchema),
}
