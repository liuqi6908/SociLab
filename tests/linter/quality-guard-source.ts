import * as ts from 'typescript'

/** -------------------- 类型 -------------------- */
/** 待守卫检查的 TypeScript 源码 */
export interface TypeScriptSource {
  /** 仓库相对路径 */
  filePath: string
  /** 源码文本 */
  source: string
}

/** 已解析的 TypeScript 源码 */
export interface ParsedTypeScriptSource extends TypeScriptSource {
  /** TypeScript AST */
  sourceFile: ts.SourceFile
}

/** -------------------- AST 工具 -------------------- */
/**
 * 将受控源码解析为真实 TypeScript AST
 */
export function parseTypeScriptSources(sources: readonly TypeScriptSource[]) {
  return sources.map((item): ParsedTypeScriptSource => ({
    ...item,
    sourceFile: ts.createSourceFile(
      item.filePath,
      item.source,
      ts.ScriptTarget.Latest,
      true,
      item.filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }))
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

  if (isModuleCall && specifier && ts.isStringLiteral(specifier))
    return { node: specifier, value: specifier.text }
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

/**
 * 解开不改变表达式语义的 TypeScript 包装
 */
export function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapExpression(expression.expression)
  }

  return expression
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
