import type { TypeScriptSource } from './quality-guard-source'
import path from 'node:path'
import * as ts from 'typescript'
import {
  comparePositionedDiagnostics,
  isProjectModuleCollection,
  isTanStackRoutesDirectory,
  parseTypeScriptSources,
  positionOf,
  unwrapExpression,
} from './quality-guard-source'

/** -------------------- 类型 -------------------- */
/** 模块目录职责布局诊断 */
export interface ModuleDirectoryLayoutDiagnostic {
  /** 唯一子目录包含的源码文件数 */
  childFileCount: number
  /** 唯一子目录 */
  childPath: string
  /** 当前聚合目录 */
  directoryPath: string
  /** 推荐的目录调整方式 */
  kind: 'flatten' | 'split'
}

/** 自定义 Hook 模块边界诊断 */
export interface CustomHookModuleDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 自定义 Hook 名称 */
  hookName: string
  /** 诊断行号 */
  line: number
}

/** 测试文件规模与领域依赖诊断 */
export interface TestStructureDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind: 'cross-domain-import' | 'file-too-large'
  /** 超限测试文件行数 */
  lineCount?: number
  /** 被跨领域引用的测试目录 */
  targetDomain?: string
}

/** -------------------- 常量 -------------------- */
/** 单测试文件允许的最大行数 */
const maxTestFileLines = 2_000

/** -------------------- 模块目录 -------------------- */
/**
 * 检查源码聚合目录是否形成真实的并列模块
 */
export function readModuleDirectoryLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const filePaths = sources.map(source => source.filePath)
  const indexDirectories = new Set(
    filePaths
      .filter(filePath => /^index\.tsx?$/.test(path.posix.basename(filePath)))
      .map(filePath => path.posix.dirname(filePath)),
  )
  const diagnostics: ModuleDirectoryLayoutDiagnostic[] = []

  for (const directoryPath of indexDirectories) {
    if (
      isTanStackRoutesDirectory(directoryPath)
      || isProjectModuleCollection(directoryPath)
    ) {
      continue
    }

    const prefix = `${directoryPath}/`
    const childNames = new Set<string>()

    for (const filePath of filePaths) {
      if (!filePath.startsWith(prefix))
        continue

      const relativePath = filePath.slice(prefix.length)
      const separatorIndex = relativePath.indexOf('/')

      if (separatorIndex > 0)
        childNames.add(relativePath.slice(0, separatorIndex))
    }

    if (childNames.size !== 1)
      continue

    const [childName] = childNames

    if (!childName)
      continue

    const childPath = `${directoryPath}/${childName}`
    const childPrefix = `${childPath}/`
    const childFileCount = filePaths.filter(filePath => (
      filePath.startsWith(childPrefix)
    )).length

    diagnostics.push({
      childFileCount,
      childPath,
      directoryPath,
      kind: childFileCount === 1 ? 'flatten' : 'split',
    })
  }

  return diagnostics.sort((left, right) => (
    left.directoryPath.localeCompare(right.directoryPath)
  ))
}

/** -------------------- React -------------------- */
/**
 * 检查自定义 Hook 实现是否从 TSX 组件模块中拆出
 */
export function readCustomHookModuleDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: CustomHookModuleDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    if (!filePath.endsWith('.tsx'))
      continue

    /** 记录 TSX 中具有实际实现体的自定义 Hook */
    const report = (hookName: string, node: ts.Node) => {
      diagnostics.push({
        ...positionOf(sourceFile, node),
        filePath,
        hookName,
      })
    }
    /** 遍历顶层与嵌套声明 */
    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node)
        && node.body
        && node.name
        && /^use[A-Z0-9]/.test(node.name.text)
      ) {
        report(node.name.text, node.name)
      }
      else if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && /^use[A-Z0-9]/.test(node.name.text)
        && node.initializer
      ) {
        const initializer = unwrapExpression(node.initializer)

        if (
          ts.isArrowFunction(initializer)
          || ts.isFunctionExpression(initializer)
        ) {
          report(node.name.text, node.name)
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/** -------------------- 测试结构 -------------------- */
/**
 * 检查测试文件规模与跨领域相对依赖
 */
export function readTestStructureDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TestStructureDiagnostic[] = []

  for (const { filePath, source, sourceFile } of parseTypeScriptSources(sources)) {
    if (/\.(?:spec|test)\.tsx?$/.test(filePath)) {
      const lineCount = source.split(/\r?\n/).length

      if (lineCount > maxTestFileLines)
        diagnostics.push({ filePath, kind: 'file-too-large', lineCount })
    }

    const pathParts = filePath.split('/')

    if (pathParts[0] !== 'tests' || pathParts.length < 3)
      continue

    const sourceDomain = pathParts[1]
    const targetDomains = new Set<string>()
    /** 收集跨领域相对导入目标 */
    const visit = (node: ts.Node) => {
      const moduleSpecifier = ts.isImportDeclaration(node)
        || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : undefined

      if (
        moduleSpecifier
        && ts.isStringLiteral(moduleSpecifier)
        && moduleSpecifier.text.startsWith('.')
      ) {
        const targetPath = path.posix.normalize(path.posix.join(
          path.posix.dirname(filePath),
          moduleSpecifier.text,
        ))
        const [targetRoot, targetDomain] = targetPath.split('/')

        if (
          targetRoot === 'tests'
          && targetDomain
          && targetDomain !== sourceDomain
          && targetDomain !== 'support'
        ) {
          targetDomains.add(targetDomain)
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)

    for (const targetDomain of [...targetDomains].sort()) {
      diagnostics.push({
        filePath,
        kind: 'cross-domain-import',
        targetDomain,
      })
    }
  }

  return diagnostics.sort((left, right) => (
    left.filePath.localeCompare(right.filePath)
    || left.kind.localeCompare(right.kind)
  ))
}
