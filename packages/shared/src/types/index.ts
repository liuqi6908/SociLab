/** -------------------- 类型 -------------------- */
/** 运行时可用的标准 Fetch 函数 */
export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** 只读的未知对象 */
export type UnknownRecord = Record<string, unknown>

/** 同步或异步返回值 */
export type Promisable<T> = PromiseLike<T> | T
