import { readdirSync, readFileSync } from 'node:fs'
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

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
export const repositoryRoot = path.resolve(import.meta.dirname, '../..')
/** 需要统一执行 Linter 检查的源码根目录 */
export const linterSourceRoots = [
  'packages',
  'projects',
  'tests',
] as const
/** 全仓守卫共同排除的生成、依赖、构建、缓存与临时目录 */
export const repositoryIgnoredDirNames: ReadonlySet<string> = new Set([
  '.cache',
  '.codegraph',
  '.git',
  '.pnpm-store',
  '.tanstack',
  '.tmp',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
])
/** 全仓守卫共同排除的生成文件 */
export const repositoryIgnoredFileNames: ReadonlySet<string> = new Set([
  'routeTree.gen.ts',
])
/** 统一忽略的负例夹具目录 */
const ignoredFixtureDirectoryPath = 'tests/linter/fixtures'

/** -------------------- 核心函数 -------------------- */
/**
 * 独立枚举指定根目录中的 TypeScript 源码
 */
export function readTypeScriptSources(
  sourceRoots: readonly string[] = linterSourceRoots,
  root = repositoryRoot,
) {
  const sources: TypeScriptSource[] = []

  /** 递归收集当前目录中的 TypeScript 文件 */
  const collect = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => (
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0
      ))

    for (const entry of entries) {
      if (entry.isDirectory() && repositoryIgnoredDirNames.has(entry.name))
        continue

      const absolutePath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const relativeDirectoryPath = toPosixPath(path.relative(root, absolutePath))

        if (relativeDirectoryPath === ignoredFixtureDirectoryPath)
          continue

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

  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = path.resolve(root, sourceRoot)

    try {
      collect(absoluteRoot)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  return sources.sort((left, right) => (
    left.filePath < right.filePath ? -1 : left.filePath > right.filePath ? 1 : 0
  ))
}

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
 * 读取静态可判定的 ESM、类型导入与 CommonJS 模块说明符
 */
export function readModuleSpecifier(node: ts.Node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier
    && ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return { node: node.moduleSpecifier, value: node.moduleSpecifier.text }
  }

  if (ts.isImportEqualsDeclaration(node)) {
    const reference = node.moduleReference

    if (
      ts.isExternalModuleReference(reference)
      && ts.isStringLiteralLike(reference.expression)
    ) {
      return { node: reference.expression, value: reference.expression.text }
    }
  }

  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal

    if (ts.isStringLiteralLike(literal))
      return { node: literal, value: literal.text }
  }

  if (!ts.isCallExpression(node))
    return

  const isModuleCall = node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
  const [specifier] = node.arguments

  if (isModuleCall && specifier && ts.isStringLiteralLike(specifier))
    return { node: specifier, value: specifier.text }
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

/** -------------------- 内部函数 -------------------- */
/**
 * 统一输出 POSIX 相对路径
 */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}
