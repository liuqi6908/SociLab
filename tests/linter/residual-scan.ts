import type { TypeScriptSource } from './source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import {
  parseTypeScriptSources,
  positionOf,
  readModuleSpecifier,
  repositoryIgnoredDirNames,
  repositoryIgnoredFileNames,
  repositoryRoot,

} from './source'

// cspell:ignore qygent Qiyan

/** -------------------- 类型 -------------------- */
/** 领域残留诊断 */
export interface ResidualDiagnostic {
  /** AST 残留诊断列号 */
  column?: number
  /** 诊断文件 */
  filePath: string
  /** 残留类型 */
  kind: 'dependency' | 'identifier' | 'module' | 'product' | 'script'
  /** AST 残留诊断行号 */
  line?: number
  /** 精确残留值 */
  value: string
}

/** -------------------- 常量 -------------------- */
const forbiddenIdentifierNames = new Set([
  'Agent',
  'Electron',
  'Plugin',
  'Runtime',
  'Thread',
])
const forbiddenModuleSegments = new Set([
  'agent',
  'electron',
  'plugin',
  'runtime',
  'thread',
])
const dependencyGroups = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const
const residualOnlyIgnoredDirNames = new Set([
  '.superpowers',
  'docs',
])
const rootConfigNames = new Set([
  '.npmrc',
  'pnpm-workspace.yaml',
  'turbo.json',
])

/** -------------------- 源码扫描 -------------------- */
/** 通过 TypeScript AST 扫描源码 import、标识符和产品字面量 */
export async function readSourceResidualDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ResidualDiagnostic[] = []

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    const visit = (node: ts.Node) => {
      const moduleSpecifier = readModuleSpecifier(node)

      if (moduleSpecifier && isForbiddenModuleSpecifier(moduleSpecifier.value)) {
        diagnostics.push({
          ...positionOf(sourceFile, moduleSpecifier.node),
          filePath,
          kind: 'module',
          value: moduleSpecifier.value,
        })
      }

      if (ts.isIdentifier(node) && forbiddenIdentifierNames.has(node.text)) {
        diagnostics.push({
          ...positionOf(sourceFile, node),
          filePath,
          kind: 'identifier',
          value: node.text,
        })
      }

      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        && /\b(?:QiyanAgent|QiyanSoft)\b/.test(node.text)
      ) {
        diagnostics.push({
          ...positionOf(sourceFile, node),
          filePath,
          kind: 'product',
          value: node.text,
        })
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return uniqueDiagnostics(diagnostics)
}

/** 扫描 CSS、HTML、环境文件和结构化配置中的精确残留标识 */
export function readTextResidualDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ResidualDiagnostic[] = []

  for (const { filePath, source } of sources) {
    for (const match of source.matchAll(/@?\w[\w.-]*(?:\/[\w.-]+)*/g)) {
      const value = match[0]

      if (!isForbiddenModuleSpecifier(value))
        continue

      diagnostics.push({
        ...positionOfText(source, match.index),
        filePath,
        kind: 'module',
        value,
      })
    }

    for (const match of source.matchAll(/\b(?:Agent|Electron|Plugin|Runtime|Thread)\b/g)) {
      diagnostics.push({
        ...positionOfText(source, match.index),
        filePath,
        kind: 'identifier',
        value: match[0],
      })
    }

    for (const match of source.matchAll(/\b(?:QiyanAgent|QiyanSoft)\b/g)) {
      diagnostics.push({
        ...positionOfText(source, match.index),
        filePath,
        kind: 'product',
        value: match[0],
      })
    }
  }

  return uniqueDiagnostics(diagnostics)
}

/** -------------------- Manifest 扫描 -------------------- */
/** 解析 package.json 并检查依赖键与脚本命令 */
export function readManifestResidualDiagnostics(
  filePath: string,
  source: string,
) {
  const manifest: unknown = JSON.parse(source)

  if (!isRecord(manifest))
    return []

  const diagnostics: ResidualDiagnostic[] = []

  for (const groupName of dependencyGroups) {
    const group = manifest[groupName]

    if (!isRecord(group))
      continue

    for (const dependencyName of Object.keys(group)) {
      if (isForbiddenDependency(dependencyName)) {
        diagnostics.push({
          filePath,
          kind: 'dependency',
          value: dependencyName,
        })
      }
    }
  }

  const scripts = manifest.scripts

  if (isRecord(scripts)) {
    for (const command of Object.values(scripts)) {
      if (typeof command !== 'string')
        continue

      diagnostics.push(...readTextResidualDiagnostics([{ filePath, source: command }]).map(item => ({
        ...item,
        column: undefined,
        kind: 'script' as const,
        line: undefined,
      })))
    }
  }

  return uniqueDiagnostics(diagnostics)
}

/** -------------------- 全仓 Gate -------------------- */
/** 扫描真实仓库生产源码、配置和全部依赖声明 */
export async function scanRepositoryResiduals(root = repositoryRoot) {
  const files = readRepositoryResidualFiles(root)
  const typeScriptSources = files.filter(file => isTypeScriptSource(file.filePath))
  const textSources = files.filter(file => !isTypeScriptSource(file.filePath))
  const batchedDiagnostics = [
    ...await readSourceResidualDiagnostics(typeScriptSources),
    ...readTextResidualDiagnostics(textSources),
  ]
  const diagnosticsByFilePath = Map.groupBy(
    batchedDiagnostics,
    diagnostic => diagnostic.filePath,
  )
  const sourceDiagnostics = files.flatMap(file => (
    diagnosticsByFilePath.get(file.filePath) ?? []
  ))
  const manifestDiagnostics = readRepositoryManifestPaths(root).flatMap(filePath => (
    readManifestResidualDiagnostics(
      toPosixPath(path.relative(root, filePath)),
      readFileSync(filePath, 'utf8'),
    )
  ))

  return [...sourceDiagnostics, ...manifestDiagnostics]
}

/** -------------------- 内部函数 -------------------- */
function isForbiddenModuleSpecifier(specifier: string) {
  if (/^@qygent(?:\/|$)/.test(specifier))
    return true

  if (/^@socilab\/(?:agent|electron|plugin|runtime|thread)(?:\/|$)/.test(specifier))
    return true

  if (isElectronPackage(specifier))
    return true

  if (!specifier.startsWith('.'))
    return false

  return specifier.split('/').some(segment => forbiddenModuleSegments.has(segment))
}

function isForbiddenDependency(name: string) {
  return isElectronPackage(name)
    || /^@qygent(?:\/|$)/.test(name)
    || /^@socilab\/(?:agent|electron|plugin|runtime|thread)(?:\/|$)/.test(name)
}

function isElectronPackage(name: string) {
  return name === 'electron'
    || name.startsWith('electron/')
    || name.startsWith('electron-')
    || /^@electron\/[^/]+(?:\/|$)/.test(name)
}

function readRepositoryManifestPaths(root: string) {
  const paths = [path.join(root, 'package.json')]

  for (const sourceRoot of ['packages', 'projects']) {
    const absoluteRoot = path.join(root, sourceRoot)

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (
        !entry.isDirectory()
        || repositoryIgnoredDirNames.has(entry.name)
        || residualOnlyIgnoredDirNames.has(entry.name)
      ) {
        continue
      }

      const manifestPath = path.join(absoluteRoot, entry.name, 'package.json')

      try {
        readFileSync(manifestPath)
        paths.push(manifestPath)
      }
      catch {
        // 没有 Manifest 的目录不属于 workspace 包
      }
    }
  }

  return paths
}

/** 按明确白名单枚举生产源码、非 fixture 测试与工程配置 */
function readRepositoryResidualFiles(root: string) {
  const files: { filePath: string, source: string }[] = []

  const collect = (directoryPath: string) => {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (
        entry.isDirectory()
        && (
          repositoryIgnoredDirNames.has(entry.name)
          || residualOnlyIgnoredDirNames.has(entry.name)
        )
      ) {
        continue
      }

      const absolutePath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        collect(absolutePath)
        continue
      }

      if (!entry.isFile() || !isRepositoryResidualFile(entry.name))
        continue

      files.push({
        filePath: toPosixPath(path.relative(root, absolutePath)),
        source: readFileSync(absolutePath, 'utf8'),
      })
    }
  }

  for (const sourceRoot of ['packages', 'projects', 'tests'])
    collect(path.join(root, sourceRoot))

  for (const entry of readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && isRootResidualConfig(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    files.push({
      filePath: entry.name,
      source: readFileSync(path.join(root, entry.name), 'utf8'),
    })
  }

  return files
}

function isRepositoryResidualFile(name: string) {
  return !repositoryIgnoredFileNames.has(name)
    && (
      isTypeScriptSource(name)
      || /\.(?:css|html)$/.test(name)
      || /^\.env(?:\..+)?$/.test(name)
      || /^tsconfig(?:\.[^.]+)?\.json$/.test(name)
      || name === '.npmrc'
    )
}

function isRootResidualConfig(name: string) {
  return rootConfigNames.has(name)
    || /^\.env(?:\..+)?$/.test(name)
    || /^tsconfig(?:\.[^.]+)?\.json$/.test(name)
    || /\.config\.[cm]?[jt]s$/.test(name)
}

function isTypeScriptSource(filePath: string) {
  return /\.[jt]sx?$/.test(filePath) || /\.[cm][jt]s$/.test(filePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueDiagnostics(diagnostics: readonly ResidualDiagnostic[]) {
  const seen = new Set<string>()

  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.filePath,
      diagnostic.kind,
      diagnostic.value,
      diagnostic.line,
      diagnostic.column,
    ].join('\0')

    if (seen.has(key))
      return false

    seen.add(key)
    return true
  })
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function positionOfText(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n')

  return {
    column: lines.at(-1)!.length + 1,
    line: lines.length,
  }
}
