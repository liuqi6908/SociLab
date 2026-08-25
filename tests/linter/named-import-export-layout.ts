/**
 * 源实现来自内部参考仓库 9da43edf 的 tests/linter/named-import-export-layout.ts
 * 原实现遍历 TypeScript AST，本项目改用 TypeScript 6 公共 AST 与既有解析边界
 * 本守卫不涉及响应式依赖、回调更新或 SSR/浏览器生命周期，失败统一返回布局诊断
 */
import type { TypeScriptSource } from './quality-guard-source'
import * as ts from 'typescript'
import {
  comparePositionedDiagnostics,
  parseTypeScriptSources,
  positionOf,
} from './quality-guard-source'

/** -------------------- 类型 -------------------- */
/** 命名导入或导出换行诊断 */
export interface NamedImportExportLayoutDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 语句类型 */
  kind: 'export' | 'import'
  /** 诊断行号 */
  line: number
  /** 命名成员数量 */
  memberCount: number
  /** 折叠后的单行字符数 */
  singleLineLength: number
}

/** -------------------- 常量 -------------------- */
/** 必须拆行前的单行字符数上限 */
export const MAX_SINGLE_LINE_IMPORT_EXPORT_LENGTH = 120

/** -------------------- 核心函数 -------------------- */
/**
 * 检查命名导入与导出是否按单行长度换行
 */
export function readNamedImportExportLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: NamedImportExportLayoutDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    /** 读取命名导入或导出的成员和语句类型 */
    const readNamedMembers = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node)
        && node.importClause?.namedBindings
        && ts.isNamedImports(node.importClause.namedBindings)
      ) {
        return {
          kind: 'import' as const,
          members: node.importClause.namedBindings.elements,
        }
      }

      if (
        ts.isExportDeclaration(node)
        && node.exportClause
        && ts.isNamedExports(node.exportClause)
      ) {
        return {
          kind: 'export' as const,
          members: node.exportClause.elements,
        }
      }
    }

    /** 把声明折叠为用于判断单行长度的稳定文本 */
    const readSingleLineText = (node: ts.Node) => (
      node.getText(sourceFile)
        .replace(/\s+/g, ' ')
        .replace(/,\s*\}/g, ' }')
    )

    /** 遍历全部命名导入与导出声明 */
    const visit = (node: ts.Node) => {
      const named = readNamedMembers(node)

      if (named) {
        const text = node.getText(sourceFile)
        const singleLineText = readSingleLineText(node)
        const isMultiline = text.includes('\n')
        const shouldBeMultiline = singleLineText.length
          > MAX_SINGLE_LINE_IMPORT_EXPORT_LENGTH

        if (isMultiline !== shouldBeMultiline) {
          diagnostics.push({
            ...positionOf(sourceFile, node),
            filePath,
            kind: named.kind,
            memberCount: named.members.length,
            singleLineLength: singleLineText.length,
          })
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 将命名导入与导出换行诊断格式化为测试失败信息
 */
export function formatNamedImportExportLayoutDiagnostics(
  diagnostics: readonly NamedImportExportLayoutDiagnostic[],
) {
  return [
    '命名导入与导出布局检查失败：',
    ...diagnostics.map((item) => {
      const location = `${item.filePath}:${item.line}:${item.column}`

      return item.singleLineLength <= MAX_SINGLE_LINE_IMPORT_EXPORT_LENGTH
        ? `${location} ${item.kind} 含 ${item.memberCount} 项且单行仅 ${item.singleLineLength} 字符，应写在一行内`
        : `${location} ${item.kind} 单行共 ${item.singleLineLength} 字符，超过 ${MAX_SINGLE_LINE_IMPORT_EXPORT_LENGTH} 字符，应拆成多行`
    }),
  ].join('\n')
}

/**
 * 断言命名导入与导出均按单行长度换行
 */
export function assertNamedImportExportLayout(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = readNamedImportExportLayoutDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatNamedImportExportLayoutDiagnostics(diagnostics))
}
