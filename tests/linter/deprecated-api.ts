/**
 * 源实现来自内部参考仓库 9da43edf 的 tests/linter/deprecated-api.ts
 * 原实现读取 Language Service suggestion，本项目改用 TypeScript 6 公共同步 API
 * 本守卫不涉及响应式依赖、回调更新或 SSR/浏览器生命周期，失败统一返回源码诊断
 */
import type { TypeScriptSource } from './source'
import path from 'node:path'
import * as ts from 'typescript'
import { comparePositionedDiagnostics } from './source'

/** -------------------- 类型 -------------------- */
/** 废弃 API 使用诊断 */
export interface DeprecatedApiDiagnostic {
  /** TypeScript 诊断码 */
  code: number
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** TypeScript 诊断信息 */
  message: string
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')

/** -------------------- 核心函数 -------------------- */
/**
 * 通过 TypeScript Language Service 检查源码中的废弃 API 使用
 */
export function readDeprecatedApiDiagnostics(
  sources: readonly TypeScriptSource[],
  root = repositoryRoot,
) {
  const sourceByFileName = new Map(sources.map(item => [
    path.resolve(root, item.filePath),
    item,
  ]))
  const fileNames = [...sourceByFileName.keys()]
  const configPath = ts.findConfigFile(root, ts.sys.fileExists)
  const config = configPath
    ? ts.readConfigFile(configPath, ts.sys.readFile).config as unknown
    : {}
  const compilerOptions = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    configPath ? path.dirname(configPath) : root,
  ).options
  const host: ts.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: fileName => (
      sourceByFileName.has(path.resolve(fileName)) || ts.sys.fileExists(fileName)
    ),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => root,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getScriptFileNames: () => fileNames,
    getScriptSnapshot: (fileName) => {
      const source = sourceByFileName.get(path.resolve(fileName))?.source
        ?? ts.sys.readFile(fileName)

      return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source)
    },
    getScriptVersion: () => '0',
    readDirectory: ts.sys.readDirectory,
    readFile: fileName => (
      sourceByFileName.get(path.resolve(fileName))?.source ?? ts.sys.readFile(fileName)
    ),
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }
  const service = ts.createLanguageService(host)
  const diagnostics: DeprecatedApiDiagnostic[] = []

  try {
    for (const fileName of fileNames) {
      const sourceFile = service.getProgram()?.getSourceFile(fileName)

      if (!sourceFile)
        continue

      for (const diagnostic of service.getSuggestionDiagnostics(fileName)) {
        if (!diagnostic.reportsDeprecated || diagnostic.start === undefined)
          continue

        const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)

        diagnostics.push({
          code: diagnostic.code,
          column: position.character + 1,
          filePath: sourceByFileName.get(fileName)?.filePath
            ?? path.relative(root, fileName).split(path.sep).join('/'),
          line: position.line + 1,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        })
      }
    }
  }
  finally {
    service.dispose()
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 将废弃 API 诊断格式化为测试失败信息
 */
export function formatDeprecatedApiDiagnostics(
  diagnostics: readonly DeprecatedApiDiagnostic[],
) {
  return [
    '废弃 API 检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} TS${item.code}: ${item.message}`
    )),
  ].join('\n')
}

/**
 * 断言一组源码未使用 TypeScript 标记的废弃 API
 */
export function assertNoDeprecatedApis(sources: readonly TypeScriptSource[]) {
  const diagnostics = readDeprecatedApiDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatDeprecatedApiDiagnostics(diagnostics))
}
