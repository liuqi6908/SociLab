import type { LoggerEvent } from 'babel-plugin-react-compiler'
import type { TypeScriptSource } from './source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { transformSync } from '@babel/core'
import reactCompiler from 'babel-plugin-react-compiler'
import { repositoryIgnoredDirNames, repositoryIgnoredFileNames } from './source'

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
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
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

/**
 * 格式化 React Compiler 失败诊断
 */
export function formatReactCompilerDiagnostics(
  result: ReactCompilerResult,
) {
  return [
    'React Compiler 检查失败：',
    ...result.diagnostics.map(item => (
      `- ${item.filePath}:${item.line} ${item.kind} ${item.reason}`
    )),
  ].join('\n')
}

/**
 * 断言源码可被 React Compiler 编译
 */
export function assertReactCompiler(sources: readonly TypeScriptSource[]) {
  const result = readReactCompilerDiagnostics(sources)

  if (result.diagnostics.length > 0)
    throw new Error(formatReactCompilerDiagnostics(result))

  return result
}

/** -------------------- 内部函数 -------------------- */
/**
 * 枚举仓库 TypeScript 源码并排除生成、依赖、构建和负 fixture
 */
function readRepositoryTypeScriptSources(
  sourceRoots: readonly string[],
  root = repositoryRoot,
) {
  const sources: TypeScriptSource[] = []

  /** 收集指定源码目录 */
  const collect = (directoryPath: string) => {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isDirectory() && repositoryIgnoredDirNames.has(entry.name))
        continue

      const absolutePath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        collect(absolutePath)
        continue
      }

      if (
        !entry.isFile()
        || !/\.tsx?$/.test(entry.name)
        || repositoryIgnoredFileNames.has(entry.name)
      ) {
        continue
      }

      sources.push({
        filePath: toPosixPath(path.relative(root, absolutePath)),
        source: readFileSync(absolutePath, 'utf8'),
      })
    }
  }

  for (const sourceRoot of sourceRoots)
    collect(path.resolve(root, sourceRoot))

  return sources.sort((left, right) => left.filePath.localeCompare(right.filePath))
}

/**
 * 将文件路径转换为 POSIX 格式
 */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

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
