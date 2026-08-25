import type { TypeScriptSource } from './source'
import * as ts from 'typescript'
import { parseTypeScriptSources, positionOf } from './source'

/** -------------------- 类型 -------------------- */
/** 公共 Interface 注释诊断 */
export interface InterfaceCommentDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** Interface 名称 */
  interfaceName: string
  /** 缺少注释的目标 */
  target: string
  /** 诊断行号 */
  line: number
}

/** -------------------- 核心函数 -------------------- */
/**
 * 检查导出 Interface 声明和成员是否具有 JSDoc
 */
export function readInterfaceCommentDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: InterfaceCommentDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    const locallyExportedNames = new Set(sourceFile.statements.flatMap((statement) => {
      if (
        !ts.isExportDeclaration(statement)
        || statement.moduleSpecifier
        || !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
      ) {
        return []
      }

      return statement.exportClause.elements.map(element => (
        element.propertyName?.text ?? element.name.text
      ))
    }))
    const visit = (node: ts.Node) => {
      if (
        ts.isInterfaceDeclaration(node)
        && (
          hasModifier(node, ts.SyntaxKind.ExportKeyword)
          || locallyExportedNames.has(node.name.text)
        )
      ) {
        const interfaceName = node.name.text

        if (!hasJSDoc(node)) {
          diagnostics.push({
            ...positionOf(sourceFile, node),
            filePath,
            interfaceName,
            target: 'interface',
          })
        }

        for (const member of node.members) {
          if (!hasJSDoc(member)) {
            diagnostics.push({
              ...positionOf(sourceFile, member),
              filePath,
              interfaceName,
              target: readMemberName(member, sourceFile),
            })
          }
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics
}

/**
 * 将 Interface 注释诊断格式化为测试失败信息
 */
export function formatInterfaceCommentDiagnostics(
  diagnostics: readonly InterfaceCommentDiagnostic[],
) {
  return [
    'Interface 注释检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.interfaceName}:${item.target}`
    )),
  ].join('\n')
}

/**
 * 断言导出 Interface 及成员均具有 JSDoc
 */
export function assertInterfaceComments(sources: readonly TypeScriptSource[]) {
  const diagnostics = readInterfaceCommentDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatInterfaceCommentDiagnostics(diagnostics))
}

/** -------------------- 内部函数 -------------------- */
function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(modifier => modifier.kind === kind) === true
}

function hasJSDoc(node: ts.Node) {
  return ts.getJSDocCommentsAndTags(node).some(ts.isJSDoc)
}

function readMemberName(member: ts.TypeElement, sourceFile: ts.SourceFile) {
  return 'name' in member && member.name
    ? member.name.getText(sourceFile)
    : ts.SyntaxKind[member.kind]
}
