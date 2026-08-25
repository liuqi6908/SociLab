import type { ReactHookOrderDiagnostic as QualityReactHookOrderDiagnostic } from './quality-guards'
import type { TypeScriptSource } from './quality-guard-source'
import { readReactHookOrderDiagnostics as readQualityReactHookOrderDiagnostics } from './quality-guards'
import { readRepositoryTypeScriptSources } from './quality-guards'

/** -------------------- 类型 -------------------- */
/** React Hook 阶段顺序诊断 */
export interface ReactHookOrderDiagnostic extends QualityReactHookOrderDiagnostic {}

/** -------------------- 常量 -------------------- */
/** React Hook 守卫扫描的前端源码根目录 */
const reactHookSourceRoots = [
  'packages/shared-ui/src',
  'projects/admin/src',
  'projects/client/src',
] as const

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 React Hook 守卫扫描目标源码
 */
export function readReactHookSources(): TypeScriptSource[] {
  return readRepositoryTypeScriptSources(reactHookSourceRoots)
    .filter(item => !item.filePath.endsWith('.d.ts'))
}

/**
 * 读取 React Hook 阶段顺序诊断
 */
export function readReactHookOrderDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return readQualityReactHookOrderDiagnostics(sources)
}
