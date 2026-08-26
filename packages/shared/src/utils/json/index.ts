/** -------------------- 核心函数 -------------------- */
/** 安全解析 JSON，无法解析时返回 undefined */
export function jsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return undefined
  }
}
