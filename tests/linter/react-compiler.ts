/**
 * 比照 qygent@9da43edf 的 tests/linter/react-compiler.test.ts
 * 原实现通过 Babel logger 汇总真实 Compiler 事件并允许项目历史失败预算
 * SociLab 只扫描 Client、Admin 与 Shared UI TSX，并将所有失败收窄为零预算诊断
 * 本检查不参与 React 响应式、回调更新或 SSR 生命周期，转换异常也作为硬诊断返回
 */
// cspell:ignore qygent
import type { LoggerEvent } from 'babel-plugin-react-compiler'
import type { TypeScriptSource } from './quality-guard-source'
import { transformSync } from '@babel/core'
import reactCompiler from 'babel-plugin-react-compiler'
import { readRepositoryTypeScriptSources } from './quality-guards'

/** -------------------- 类型 -------------------- */
/** React Compiler 失败诊断 */
export interface ReactCompilerDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** Compiler 诊断类型 */
  kind: LoggerEvent['kind'] | 'TransformError'
  /** 诊断行号 */
  line: number
  /** Compiler 失败原因 */
  reason: string
}

/** React Compiler 扫描结果 */
export interface ReactCompilerResult {
  /** 成功编译的 React 函数数量 */
  compiledFunctions: number
  /** 零预算下不允许保留的 Compiler 诊断 */
  diagnostics: ReactCompilerDiagnostic[]
}

/** -------------------- 常量 -------------------- */
/** React Compiler 当前与未来源码根目录 */
const reactCompilerSourceRoots = [
  'projects/client/src',
  'projects/admin/src',
  'packages/shared-ui/src',
] as const

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 React Compiler 目标源码
 */
export function readReactCompilerSources(): TypeScriptSource[] {
  return readRepositoryTypeScriptSources(reactCompilerSourceRoots)
    .filter(item => item.filePath.endsWith('.tsx'))
}

/**
 * 使用真实 React Compiler 检查源码
 */
export function readReactCompilerDiagnostics(
  sources: readonly TypeScriptSource[],
): ReactCompilerResult {
  const diagnostics: ReactCompilerDiagnostic[] = []
  let compiledFunctions = 0

  for (const { filePath, source } of sources) {
    /** 将 Compiler 事件收窄为零预算守卫关注的失败 */
    const logEvent = (_filename: string | null, event: LoggerEvent) => {
      if (event.kind === 'CompileSuccess') {
        compiledFunctions += 1
        return
      }

      const diagnostic = readReactCompilerDiagnostic(filePath, event)

      if (diagnostic)
        diagnostics.push(diagnostic)
    }

    try {
      transformSync(source, {
        babelrc: false,
        configFile: false,
        filename: filePath,
        parserOpts: {
          plugins: ['typescript', 'jsx'],
          sourceType: 'module',
        },
        plugins: [[reactCompiler, { logger: { logEvent } }]],
      })
    }
    catch (error) {
      diagnostics.push({
        filePath,
        kind: 'TransformError',
        line: 0,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  diagnostics.sort((left, right) => (
    left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.kind.localeCompare(right.kind)
  ))

  return { compiledFunctions, diagnostics }
}

/** -------------------- 内部函数 -------------------- */
/**
 * 将真实 Compiler 事件转换为统一失败诊断
 */
function readReactCompilerDiagnostic(
  filePath: string,
  event: LoggerEvent,
): ReactCompilerDiagnostic | undefined {
  if (event.kind === 'CompileError' || event.kind === 'CompileDiagnostic') {
    return {
      filePath,
      kind: event.kind,
      line: event.fnLoc?.start.line ?? 0,
      reason: event.detail.reason,
    }
  }

  if (event.kind === 'CompileSkip') {
    return {
      filePath,
      kind: event.kind,
      line: event.loc?.start.line ?? event.fnLoc?.start.line ?? 0,
      reason: event.reason,
    }
  }

  if (event.kind === 'PipelineError') {
    return {
      filePath,
      kind: event.kind,
      line: event.fnLoc?.start.line ?? 0,
      reason: event.data,
    }
  }
}
