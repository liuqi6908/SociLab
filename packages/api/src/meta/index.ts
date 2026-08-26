import { emptyInputSchema, procedure } from '../contract.ts'
import { metaInfoSchema } from './schemas.ts'

/** -------------------- 契约 -------------------- */
/** 服务元信息技术契约 */
export const metaContract = {
  info: procedure
    .route({ method: 'GET', path: '/meta/info', summary: '读取服务信息', tags: ['Meta'] })
    .input(emptyInputSchema)
    .output(metaInfoSchema),
}
