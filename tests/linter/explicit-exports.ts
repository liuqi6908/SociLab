import type { TypeScriptSource } from './source'
import * as ts from '@typescript/native/unstable/ast'
import { parseTypeScriptSources, positionOf } from './source'

/** -------------------- 类型 -------------------- */
/** 显式导出诊断 */
export interface ExplicitExportDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind: 'default-export' | 'missing-named-export' | 'wildcard-export'
  /** 诊断行号 */
  line: number
}

/** -------------------- 常量 -------------------- */
/** 允许不导出符号的应用入口 */
const allowedEntryFilePaths = new Set([
  'projects/admin/src/main.tsx',
  'projects/client/src/main.tsx',
])

/** -------------------- 核心函数 -------------------- */
/**
 * 检查源码 default、星号导出以及缺少命名导出的模块
 */
export async function readExplicitExportDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ExplicitExportDiagnostic[] = []

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    let hasNamedExport = false

    for (const statement of sourceFile.statements) {
      if (ts.isExportAssignment(statement)) {
        diagnostics.push({
          ...positionOf(sourceFile, statement),
          filePath,
          kind: 'default-export',
        })
        continue
      }

      const modifiers = (statement as ts.Node & {
        readonly modifiers?: readonly ts.ModifierLike[]
      }).modifiers
      const exported = modifiers?.some(modifier => (
        modifier.kind === ts.SyntaxKind.ExportKeyword
      ))
      const defaultExport = modifiers?.some(modifier => (
        modifier.kind === ts.SyntaxKind.DefaultKeyword
      ))

      if (exported && defaultExport) {
        diagnostics.push({
          ...positionOf(sourceFile, statement),
          filePath,
          kind: 'default-export',
        })
        continue
      }

      if (exported)
        hasNamedExport = true

      if (!ts.isExportDeclaration(statement))
        continue

      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
        diagnostics.push({
          ...positionOf(sourceFile, statement),
          filePath,
          kind: 'wildcard-export',
        })
      }
      else if (ts.isNamedExports(statement.exportClause)) {
        const exportsDefault = statement.exportClause.elements.some(element => (
          element.name.text === 'default'
        ))

        if (exportsDefault) {
          diagnostics.push({
            ...positionOf(sourceFile, statement),
            filePath,
            kind: 'default-export',
          })
        }

        if (statement.exportClause.elements.some(element => element.name.text !== 'default'))
          hasNamedExport = true
      }
    }

    if (
      !hasNamedExport
      && !allowedEntryFilePaths.has(filePath)
      && !filePath.endsWith('.d.ts')
    ) {
      diagnostics.push({
        column: 1,
        filePath,
        kind: 'missing-named-export',
        line: 1,
      })
    }
  }

  return diagnostics
}

/**
 * 将显式导出诊断格式化为测试失败信息
 */
export function formatExplicitExportDiagnostics(
  diagnostics: readonly ExplicitExportDiagnostic[],
) {
  return [
    '显式导出检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.kind}`
    )),
  ].join('\n')
}

/**
 * 断言源码仅使用命名导出
 */
export async function assertExplicitExports(sources: readonly TypeScriptSource[]) {
  const diagnostics = await readExplicitExportDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatExplicitExportDiagnostics(diagnostics))
}
