import type { UnknownRecord } from '../../types/index.ts'

/** -------------------- 核心函数 -------------------- */
/** 判断值是否为原型为 Object 或 null 的普通对象 */
export function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null)
    return false

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}
