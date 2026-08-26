import { z } from 'zod'

/** -------------------- Schema -------------------- */
/** 服务固定元信息的共享 Schema */
export const metaInfoSchema = z.object({
  name: z.literal('SociLab'),
  version: z.literal('0.1.0'),
})
