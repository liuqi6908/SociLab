import { oc } from '@orpc/contract'
import { z } from 'zod'

/** -------------------- Schema -------------------- */
/** 无业务参数 procedure 的输入 Schema */
export const emptyInputSchema = z.strictObject({}).default({})

/** 公共 API 错误结构 */
export const apiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

/** -------------------- 契约 -------------------- */
/** 所有 API procedure 共享的 contract builder */
export const procedure = oc
