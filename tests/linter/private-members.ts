import type { TypeScriptSource } from './source'
import * as ts from 'typescript'
import {
  comparePositionedDiagnostics,
  parseTypeScriptSources,
  positionOf,
} from './source'

/** -------------------- 类型 -------------------- */
/** private 成员命名诊断 */
export interface PrivateMemberDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 成员名称 */
  name: string
  /** 诊断行号 */
  line: number
}

/** -------------------- 核心函数 -------------------- */
/**
 * 检查显式 private 成员及构造器参数属性的下划线前缀
 */
export function readPrivateMemberDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: PrivateMemberDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    const visit = (node: ts.Node) => {
      if (
        isNamedClassMember(node)
        && hasModifier(node, ts.SyntaxKind.PrivateKeyword)
        && ts.isIdentifier(node.name)
        && !node.name.text.startsWith('_')
      ) {
        diagnostics.push({
          ...positionOf(sourceFile, node.name),
          filePath,
          name: node.name.text,
        })
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 将 private 成员诊断格式化为测试失败信息
 */
export function formatPrivateMemberDiagnostics(
  diagnostics: readonly PrivateMemberDiagnostic[],
) {
  return [
    'private 成员检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.name}`
    )),
  ].join('\n')
}

/**
 * 断言显式 private 成员及参数属性均使用下划线前缀
 */
export function assertPrivateMemberNaming(sources: readonly TypeScriptSource[]) {
  const diagnostics = readPrivateMemberDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatPrivateMemberDiagnostics(diagnostics))
}

/** -------------------- 内部函数 -------------------- */
function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(modifier => modifier.kind === kind) === true
}

function isNamedClassMember(node: ts.Node): node is
  | ts.GetAccessorDeclaration
  | ts.MethodDeclaration
  | ts.ParameterDeclaration
  | ts.PropertyDeclaration
  | ts.SetAccessorDeclaration {
  return ts.isGetAccessorDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isParameter(node)
    || ts.isPropertyDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
}
