import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'
import { parseTypeScriptSources, readRepositoryTypeScriptSources } from './quality-guards'

// cspell:ignore qygent Qiyan

/** -------------------- 类型 -------------------- */
/** 领域残留诊断 */
export interface ResidualDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 残留类型 */
  kind: 'dependency' | 'identifier' | 'module' | 'product'
  /** 精确残留值 */
  value: string
}

/** -------------------- 常量 -------------------- */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
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

/** -------------------- 源码扫描 -------------------- */
/** 通过 TypeScript AST 扫描源码 import、标识符和产品字面量 */
export function readSourceResidualDiagnostics(
  sources: readonly { filePath: string, source: string }[],
) {
  const diagnostics: ResidualDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    const visit = (node: ts.Node) => {
      const moduleSpecifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : undefined

      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        if (isForbiddenModuleSpecifier(moduleSpecifier.text)) {
          diagnostics.push({
            filePath,
            kind: 'module',
            value: moduleSpecifier.text,
          })
        }
      }
      else if (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const [specifier] = node.arguments

        if (
          specifier
          && ts.isStringLiteral(specifier)
          && isForbiddenModuleSpecifier(specifier.text)
        ) {
          diagnostics.push({ filePath, kind: 'module', value: specifier.text })
        }
      }

      if (ts.isIdentifier(node) && forbiddenIdentifierNames.has(node.text))
        diagnostics.push({ filePath, kind: 'identifier', value: node.text })

      if (
        ts.isStringLiteralLike(node)
        && /\b(?:QiyanAgent|QiyanSoft)\b/.test(node.text)
      ) {
        diagnostics.push({ filePath, kind: 'product', value: node.text })
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return uniqueDiagnostics(diagnostics)
}

/** -------------------- Manifest 扫描 -------------------- */
/** 解析 package.json 并仅检查依赖键 */
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

  return diagnostics
}

/** -------------------- 全仓 Gate -------------------- */
/** 扫描真实仓库生产源码、配置和全部依赖声明 */
export function scanRepositoryResiduals(root = repositoryRoot) {
  const sources = readRepositoryTypeScriptSources(['packages', 'projects'], root)
  const rootConfigs = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.config\.(?:[cm]?js|ts)$/.test(entry.name))
    .map(entry => ({
      filePath: entry.name,
      source: readFileSync(path.join(root, entry.name), 'utf8'),
    }))
  const sourceDiagnostics = readSourceResidualDiagnostics([...sources, ...rootConfigs])
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

  if (/^electron(?:\/|$)/.test(specifier))
    return true

  if (!specifier.startsWith('.'))
    return false

  return specifier.split('/').some(segment => forbiddenModuleSegments.has(segment))
}

function isForbiddenDependency(name: string) {
  return name === 'electron'
    || /^@qygent(?:\/|$)/.test(name)
    || /^@socilab\/(?:agent|electron|plugin|runtime|thread)(?:\/|$)/.test(name)
}

function readRepositoryManifestPaths(root: string) {
  const paths = [path.join(root, 'package.json')]

  for (const sourceRoot of ['packages', 'projects']) {
    const absoluteRoot = path.join(root, sourceRoot)

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueDiagnostics(diagnostics: readonly ResidualDiagnostic[]) {
  const seen = new Set<string>()

  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.filePath}\0${diagnostic.kind}\0${diagnostic.value}`

    if (seen.has(key))
      return false

    seen.add(key)
    return true
  })
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}
