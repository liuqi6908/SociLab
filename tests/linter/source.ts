import type { SourceFile } from '@typescript/native/unstable/ast'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import { API } from '@typescript/native/unstable/async'
import { createVirtualFileSystem } from '@typescript/native/unstable/fs'

/** -------------------- 类型 -------------------- */
/** 待守卫检查的 TypeScript 源码 */
export interface TypeScriptSource {
  /** 仓库相对路径 */
  filePath: string
  /** 源码文本 */
  source: string
}

/** 已由 TypeScript 7 Program 解析的源码 */
export interface ParsedTypeScriptSource extends TypeScriptSource {
  /** TypeScript 7 AST */
  sourceFile: SourceFile
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
/** 同一批源码只建立一次 TypeScript 7 Program */
const parsedSourceCache = new WeakMap<
  readonly TypeScriptSource[],
  Promise<readonly ParsedTypeScriptSource[]>
>()
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
 * 通过 TypeScript 7 异步 Program API 解析一批真实或虚拟源码
 */
export function parseTypeScriptSources(
  sources: readonly TypeScriptSource[],
  root = repositoryRoot,
) {
  const cached = parsedSourceCache.get(sources)

  if (cached)
    return cached

  const parsing = _parseTypeScriptSources(sources, root)

  parsedSourceCache.set(sources, parsing)

  return parsing
}

/**
 * 读取静态可判定的 ESM、类型导入与 CommonJS 模块说明符
 */
export function readModuleSpecifier(node: ts.Node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier
    && ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return { node: node.moduleSpecifier, value: node.moduleSpecifier.text }
  }

  if (ts.isImportEqualsDeclaration(node)) {
    const reference = node.moduleReference

    if (
      ts.isExternalModuleReference(reference)
      && ts.isStringLiteral(reference.expression)
    ) {
      return { node: reference.expression, value: reference.expression.text }
    }
  }

  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal

    if (ts.isStringLiteral(literal))
      return { node: literal, value: literal.text }
  }

  if (!ts.isCallExpression(node))
    return

  const isModuleCall = node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
  const [specifier] = node.arguments

  if (
    isModuleCall
    && specifier
    && (
      ts.isStringLiteral(specifier)
      || ts.isNoSubstitutionTemplateLiteral(specifier)
    )
  ) {
    return { node: specifier, value: specifier.text }
  }
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
 * 建立一次 TypeScript 7 快照并物化源码 AST
 */
async function _parseTypeScriptSources(
  sources: readonly TypeScriptSource[],
  root: string,
) {
  const sourceByFileName = new Map(sources.map(item => [
    path.resolve(root, item.filePath),
    item,
  ]))
  const fileNames = [...sourceByFileName.keys()]
  const api = new API({
    cwd: root,
    fs: createVirtualFileSystem(Object.fromEntries(
      [...sourceByFileName].map(([fileName, item]) => [fileName, item.source]),
    )),
  })
  let snapshot: Awaited<ReturnType<API['updateSnapshot']>> | undefined

  try {
    const configPath = path.resolve(root, 'tsconfig.json')

    snapshot = await api.updateSnapshot({
      openFiles: fileNames,
      openProjects: [configPath],
    })

    const configuredProject = snapshot.getProject(configPath)
    const parsed = await Promise.all(fileNames.map(async (fileName) => {
      const sourceFile = await configuredProject?.program.getSourceFile(fileName)
        ?? await (
          await snapshot!.getDefaultProjectForFile(fileName)
        )?.program.getSourceFile(fileName)

      if (!sourceFile)
        throw new Error(`TypeScript 7 无法解析源码：${fileName}`)

      return {
        ...sourceByFileName.get(fileName)!,
        sourceFile,
      }
    }))

    return parsed
  }
  finally {
    if (snapshot)
      await snapshot.dispose()
    await api.close()
  }
}

/**
 * 统一输出 POSIX 相对路径
 */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}
