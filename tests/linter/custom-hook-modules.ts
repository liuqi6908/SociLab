import type { TypeScriptSource } from './quality-guard-source'
import type { CustomHookModuleDiagnostic as StructureCustomHookModuleDiagnostic } from './structure-guards'
import { readCustomHookModuleDiagnostics as readStructureCustomHookModuleDiagnostics } from './structure-guards'

/** -------------------- 类型 -------------------- */
/** 自定义 Hook 模块边界诊断 */
export interface CustomHookModuleDiagnostic extends StructureCustomHookModuleDiagnostic {}

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 JSX 组件模块中的自定义 Hook 实现诊断
 */
export function readCustomHookModuleDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return readStructureCustomHookModuleDiagnostics(sources)
}

/**
 * 格式化自定义 Hook 模块边界诊断
 */
export function formatCustomHookModuleDiagnostics(
  diagnostics: readonly CustomHookModuleDiagnostic[],
) {
  return [
    '自定义 Hook 模块边界检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.hookName} 实现位于 JSX 组件模块，应拆到 hooks.ts、hooks/ 或其他非 JSX 模块`
    )),
  ].join('\n')
}
