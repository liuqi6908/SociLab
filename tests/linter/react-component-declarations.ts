import type { ReactComponentDiagnostic as QualityReactComponentDiagnostic } from './quality-guards'
import type { TypeScriptSource } from './quality-guard-source'
import { readReactComponentDiagnostics } from './quality-guards'

/** -------------------- 类型 -------------------- */
/** React 组件声明诊断 */
export interface ReactComponentDeclarationDiagnostic extends QualityReactComponentDiagnostic {}

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 React 组件声明诊断
 */
export function readReactComponentDeclarationDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return readReactComponentDiagnostics(sources)
}
