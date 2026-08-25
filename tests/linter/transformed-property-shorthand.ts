/**
 * 比照 qygent@9da43edf 的 tests/linter/transformed-property-shorthand.ts
 * 原实现以 TypeScript AST 汇总多类项目命名建议并通过 console.warn 报告
 * SociLab 仅保留同名解构来源的内联转换建议，不复制 SDK、Store 或组件命名假设
 * 本检查无响应式、回调更新或 SSR 状态，报告回调可注入且诊断本身不会触发硬失败
 */
import type { TypeScriptSource } from './quality-guard-source'
import * as ts from 'typescript'
import {
  comparePositionedDiagnostics,
  parseTypeScriptSources,
  positionOf,
  unwrapExpression,
} from './quality-guard-source'

/** -------------------- 类型 -------------------- */
/** 对象字段内联转换诊断 */
export interface TransformedPropertyShorthandDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** 诊断信息 */
  message: string
  /** 对象字段名称 */
  property: string
}

/** -------------------- 核心函数 -------------------- */
/**
 * 检查对象字段是否内联转换同名来源
 */
export function readTransformedPropertyShorthandDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TransformedPropertyShorthandDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    /** 检查单个对象字段是否内联转换同名解构来源 */
    const inspect = (node: ts.PropertyAssignment) => {
      const property = readPropertyName(node.name)
      const initializer = unwrapExpression(node.initializer)

      if (
        !property
        || !ts.isCallExpression(initializer)
        || !initializer.arguments.some((argument) => {
          const source = unwrapExpression(argument)

          return ts.isIdentifier(source) && source.text === property
        })
        || !hasDestructuredBinding(
          readLexicalScope(node),
          property,
          node.getStart(sourceFile),
        )
      ) {
        return
      }

      diagnostics.push({
        ...positionOf(sourceFile, node),
        filePath,
        message: `${property} 内联转换了同名来源；该建议非强制，请结合具体语义判断`,
        property,
      })
    }

    /** 遍历全部对象字段 */
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node))
        inspect(node)

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 格式化对象字段转换建议
 */
export function formatTransformedPropertyShorthandDiagnostics(
  diagnostics: readonly TransformedPropertyShorthandDiagnostic[],
) {
  return [
    '对象字段转换写法建议（非强制，请结合具体语义判断）：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.message}`
    )),
  ].join('\n')
}

/**
 * 以非强制 warning 报告对象字段转换建议
 */
export function warnTransformedPropertyShorthand(
  sources: readonly TypeScriptSource[],
  warn: (message: string) => void = console.warn,
) {
  const diagnostics = readTransformedPropertyShorthandDiagnostics(sources)

  if (diagnostics.length > 0)
    warn(formatTransformedPropertyShorthandDiagnostics(diagnostics))

  return diagnostics
}

/** -------------------- 内部函数 -------------------- */
/**
 * 读取对象字段的静态名称
 */
function readPropertyName(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text
}

/**
 * 读取对象字段所在的最近词法作用域
 */
function readLexicalScope(node: ts.Node) {
  let current: ts.Node = node

  while (!ts.isSourceFile(current) && !isImplementedFunction(current))
    current = current.parent

  return current
}

/**
 * 判断节点是否是具有独立变量作用域的实现函数
 */
function isImplementedFunction(
  node: ts.Node,
): node is ts.FunctionLikeDeclaration {
  return ts.isArrowFunction(node)
    || ts.isConstructorDeclaration(node)
    || ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
}

/**
 * 判断同名来源是否由当前作用域前方的对象解构引入
 */
function hasDestructuredBinding(
  scope: ts.FunctionLikeDeclaration | ts.SourceFile,
  name: string,
  before: number,
) {
  let matched = false

  /** 只检查当前作用域，嵌套函数拥有独立绑定来源 */
  const visit = (node: ts.Node) => {
    if (
      matched
      || node.getStart(scope.getSourceFile()) >= before
      || (node !== scope && isImplementedFunction(node))
    ) {
      return
    }

    if (
      ts.isBindingElement(node)
      && ts.isObjectBindingPattern(node.parent)
      && ts.isIdentifier(node.name)
      && node.name.text === name
    ) {
      matched = true
      return
    }

    node.forEachChild(visit)
  }

  visit(scope)
  return matched
}
