/** -------------------- 类型 -------------------- */
/** 运行时可用的标准 Fetch 函数 */
export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** 只读的未知对象 */
export type UnknownRecord = Record<string, unknown>

/** -------------------- JSON 工具 -------------------- */
/** 安全解析 JSON，无法解析时返回 undefined */
export function jsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return undefined
  }
}

/** -------------------- 对象工具 -------------------- */
/** 判断值是否为原型为 Object 或 null 的普通对象 */
export function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null)
    return false

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

/** -------------------- Promise 工具 -------------------- */
/** 同步或异步返回值 */
export type Promisable<T> = T | Promise<T>
