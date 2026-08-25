import path from 'node:path'
import * as ts from 'typescript'

/** -------------------- 类型 -------------------- */
/** 待守卫检查的 TypeScript 源码 */
export interface TypeScriptSource {
  /** 仓库相对路径 */
  filePath: string
  /** 源码文本 */
  source: string
}

/** 已解析的 TypeScript 源码 */
export interface ParsedTypeScriptSource extends TypeScriptSource {
  /** TypeScript AST */
  sourceFile: ts.SourceFile
}

/** -------------------- 核心函数 -------------------- */
/**
 * 将受控源码解析为真实 TypeScript AST
 */
export function parseTypeScriptSources(sources: readonly TypeScriptSource[]) {
  return sources.map((item): ParsedTypeScriptSource => ({
    ...item,
    sourceFile: ts.createSourceFile(
      item.filePath,
      item.source,
      ts.ScriptTarget.Latest,
      true,
      item.filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }))
}

/**
 * 读取 AST 节点的一基行列位置
 */
export function positionOf(sourceFile: ts.SourceFile, node: ts.Node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

  return {
    column: position.character + 1,
    line: position.line + 1,
  }
}

/**
 * 按文件、行、列稳定排列诊断
 */
export function comparePositionedDiagnostics(
  left: { column: number, filePath: string, line: number },
  right: { column: number, filePath: string, line: number },
) {
  return left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.column - right.column
}

/**
 * 为虚拟 TypeScript 源码提供稳定的目录与文件查询边界
 */
export function createVirtualTypeScriptPathHost(
  sources: readonly TypeScriptSource[],
  root: string,
) {
  const sourceByFileName = new Map(sources.map(item => [
    path.resolve(root, item.filePath),
    item,
  ]))
  const virtualDirectoryPaths = new Set<string>()

  for (const fileName of sourceByFileName.keys()) {
    let currentDir = path.dirname(fileName)

    while (!virtualDirectoryPaths.has(currentDir)) {
      virtualDirectoryPaths.add(currentDir)

      if (currentDir === root)
        break

      const parentDir = path.dirname(currentDir)

      if (parentDir === currentDir)
        break

      currentDir = parentDir
    }
  }

  return {
    sourceByFileName,
    directoryExists: (directoryName: string) => (
      virtualDirectoryPaths.has(path.resolve(directoryName))
      || ts.sys.directoryExists(directoryName)
    ),
    fileExists: (fileName: string) => (
      sourceByFileName.has(path.resolve(fileName))
      || ts.sys.fileExists(fileName)
    ),
    getDirectories: (directoryName: string) => {
      const absoluteDir = path.resolve(directoryName)
      const virtualDirectories = [...virtualDirectoryPaths]
        .filter(item => path.dirname(item) === absoluteDir)
        .map(item => path.basename(item))
      const realDirectories = ts.sys.directoryExists(directoryName)
        ? ts.sys.getDirectories(directoryName)
        : []

      return [...new Set([
        ...realDirectories,
        ...virtualDirectories,
      ])].sort((left, right) => left.localeCompare(right))
    },
    readFile: (fileName: string) => (
      sourceByFileName.get(path.resolve(fileName))?.source
      ?? ts.sys.readFile(fileName)
    ),
  }
}

/** -------------------- 项目路径 -------------------- */
/**
 * 判断目录是否属于 TanStack 文件路由约定
 */
export function isTanStackRoutesDirectory(directoryPath: string) {
  return /^projects\/(?:admin|client)\/src\/routes(?:\/|$)/.test(directoryPath)
}

/**
 * 判断目录是否为允许从单一领域起步的应用模块集合
 */
export function isProjectModuleCollection(directoryPath: string) {
  return /^projects\/[^/]+\/src\/modules$/.test(directoryPath)
}
