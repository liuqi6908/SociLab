/**
 * 源实现来自内部参考仓库 9da43edf 的 tests/linter/parameter-properties.ts
 * 原实现遍历 TypeScript AST，本项目改用 TypeScript 6 公共 AST 与既有表达式解包工具
 * 本守卫不涉及响应式依赖、回调更新或 SSR/浏览器生命周期，失败统一返回顺序诊断
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
/** 参数属性声明顺序诊断 */
export interface ParameterPropertyOrderDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** 诊断信息 */
  message: string
  /** 所属函数 */
  scope: string
}

/** 函数参数属性声明 */
interface ParameterPropertyDeclaration {
  /** 局部绑定名称 */
  binding: string
  /** 声明节点 */
  node: ts.VariableDeclaration
  /** 来源参数名称 */
  parameter: string
}

/** -------------------- AST 检查函数 -------------------- */
/**
 * 读取变量声明直接使用的参数属性
 */
function readParameterPropertyDeclaration(
  declaration: ts.VariableDeclaration,
  parameterNames: ReadonlySet<string>,
): ParameterPropertyDeclaration | undefined {
  if (!declaration.initializer)
    return

  const initializer = unwrapExpression(declaration.initializer)

  if (
    !ts.isIdentifier(declaration.name)
    || !ts.isPropertyAccessExpression(initializer)
    || declaration.name.text !== initializer.name.text
  ) {
    return
  }

  const source = unwrapExpression(initializer.expression)

  if (!ts.isIdentifier(source) || !parameterNames.has(source.text))
    return

  return {
    binding: declaration.name.text,
    node: declaration,
    parameter: source.text,
  }
}

/**
 * 读取变量语句中的参数属性声明
 */
function readStatementParameterProperties(
  statement: ts.Statement,
  parameterNames: ReadonlySet<string>,
) {
  if (!ts.isVariableStatement(statement))
    return []

  return statement.declarationList.declarations.flatMap((declaration) => {
    const property = readParameterPropertyDeclaration(declaration, parameterNames)

    return property ? [property] : []
  })
}

/**
 * 判断变量语句是否仍属于连续的入口参数整理区
 */
function isParameterSetupStatement(
  statement: ts.Statement,
  parameterNames: ReadonlySet<string>,
) {
  if (!ts.isVariableStatement(statement))
    return false

  /** 沿直接属性链读取根参数 */
  const readRoot = (expression: ts.Expression): string | undefined => {
    let current = unwrapExpression(expression)

    while (
      ts.isPropertyAccessExpression(current)
      || ts.isElementAccessExpression(current)
    ) {
      current = unwrapExpression(current.expression)
    }

    return ts.isIdentifier(current) && parameterNames.has(current.text)
      ? current.text
      : undefined
  }

  return statement.declarationList.declarations.every(declaration => (
    declaration.initializer && readRoot(declaration.initializer)
  ))
}

/**
 * 判断语句是否不影响函数体首部的运行时声明顺序
 */
function isOrderNeutralStatement(statement: ts.Statement) {
  return ts.isEmptyStatement(statement)
    || ts.isInterfaceDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement)
    || (
      ts.isExpressionStatement(statement)
      && ts.isStringLiteral(statement.expression)
    )
}

/**
 * 判断参数类型是否要求先经过运行时收窄才能读取属性
 */
function requiresRuntimeNarrowing(parameter: ts.ParameterDeclaration) {
  if (parameter.questionToken)
    return true

  /** 递归识别显式可空和未知类型 */
  const unsafe = (type: ts.TypeNode): boolean => {
    if (ts.isUnionTypeNode(type))
      return type.types.some(unsafe)

    return type.kind === ts.SyntaxKind.AnyKeyword
      || type.kind === ts.SyntaxKind.NullKeyword
      || type.kind === ts.SyntaxKind.UndefinedKeyword
      || type.kind === ts.SyntaxKind.UnknownKeyword
  }

  return parameter.type ? unsafe(parameter.type) : true
}

/**
 * 读取函数的稳定诊断名称
 */
function readFunctionScope(node: ts.FunctionLikeDeclaration) {
  if ('name' in node && node.name)
    return node.name.getText()

  if (
    ts.isVariableDeclaration(node.parent)
    && ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text
  }

  return '<anonymous>'
}

/**
 * 判断节点是否是具有实现体的函数
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

/** -------------------- 核心函数 -------------------- */
/**
 * 检查源码中的参数属性局部声明是否集中在函数体开头
 */
export function readParameterPropertyOrderDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ParameterPropertyOrderDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    /** 检查单个函数体的首部参数属性声明区 */
    const inspect = (node: ts.FunctionLikeDeclaration) => {
      if (!node.body || !ts.isBlock(node.body))
        return

      const parameterNames = new Set(node.parameters.flatMap(parameter => (
        ts.isIdentifier(parameter.name) && !requiresRuntimeNarrowing(parameter)
          ? [parameter.name.text]
          : []
      )))

      if (parameterNames.size === 0)
        return

      let leadingDeclarations = true

      for (const statement of node.body.statements) {
        const properties = readStatementParameterProperties(
          statement,
          parameterNames,
        )

        if (properties.length > 0) {
          if (!leadingDeclarations) {
            for (const property of properties) {
              diagnostics.push({
                ...positionOf(sourceFile, property.node),
                filePath,
                message: `${property.binding} 来自参数 ${property.parameter}，必须在函数体开头声明`,
                scope: readFunctionScope(node),
              })
            }
          }

          continue
        }

        if (isParameterSetupStatement(statement, parameterNames))
          continue

        if (!isOrderNeutralStatement(statement))
          leadingDeclarations = false
      }
    }

    /** 遍历全部具有实现体的函数 */
    const visit = (node: ts.Node) => {
      if (isImplementedFunction(node))
        inspect(node)

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 将参数属性声明顺序诊断格式化为测试失败信息
 */
export function formatParameterPropertyOrderDiagnostics(
  diagnostics: readonly ParameterPropertyOrderDiagnostic[],
) {
  return [
    '参数属性声明顺序检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.scope}: ${item.message}`
    )),
  ].join('\n')
}

/**
 * 断言参数属性局部声明均位于函数体开头
 */
export function assertParameterPropertyOrder(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = readParameterPropertyOrderDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatParameterPropertyOrderDiagnostics(diagnostics))
}
