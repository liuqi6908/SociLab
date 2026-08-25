import type { ClassNameDiagnostic } from './quality-guards'
import type { TypeScriptSource } from './quality-guard-source'
import { readClassNameDiagnostics } from './quality-guards'

/** -------------------- 类型 -------------------- */
/** className 组合与布局诊断 */
export interface ClassNameCompositionDiagnostic extends ClassNameDiagnostic {}

/** -------------------- 常量 -------------------- */
/** 静态 class 字符串保持单行的最大字符数 */
export const MAX_STATIC_CLASS_NAME_LENGTH = 56
/** 普通静态 cn 分组允许的最大字符数差 */
export const MAX_CN_SEGMENT_LENGTH_DIFFERENCE = 32

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 className 组合与布局诊断
 */
export function readClassNameCompositionDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return readClassNameDiagnostics(sources)
}
