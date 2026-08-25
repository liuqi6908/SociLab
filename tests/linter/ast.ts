import * as ts from 'typescript'

/** -------------------- AST 工具函数 -------------------- */
/**
 * 解开不改变表达式语义的 TypeScript 包装
 */
export function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression

  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }

  return current
}

/**
 * 判断节点是否是具有独立变量作用域的实现函数
 */
export function isImplementedFunction(
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
