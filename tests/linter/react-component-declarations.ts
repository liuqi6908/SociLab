import type { TypeScriptSource } from './source'
import * as ts from '@typescript/native/unstable/ast'
import { unwrapExpression } from './ast'
import { parseTypeScriptSources, positionOf } from './source'

/** -------------------- 类型 -------------------- */
/** React 组件声明诊断 */
export interface ReactComponentDeclarationDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 组件名称 */
  name: string
  /** 诊断行号 */
  line: number
}

interface ReactOutputContext {
  bindingsByScope: ReadonlyMap<ts.Node, ReadonlyMap<string, readonly ts.Node[]>>
  createElementImports: ReadonlyMap<string, ts.Node>
  namespaceImports: ReadonlyMap<string, ts.Node>
}

/** -------------------- 核心函数 -------------------- */
export async function readReactComponentDeclarationDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ReactComponentDeclarationDiagnostic[] = []

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    if (!filePath.endsWith('.tsx'))
      continue

    const reactOutputContext = readReactOutputContext(sourceFile)
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && /^[A-Z]/.test(node.name.text)
        && node.initializer
      ) {
        const component = readComponentFunction(node.initializer)

        if (component && hasReactReturn(component, reactOutputContext)) {
          diagnostics.push({
            ...positionOf(sourceFile, node.name),
            filePath,
            name: node.name.text,
          })
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics
}

/**
 * 格式化 React 组件声明诊断
 */
export function formatReactComponentDeclarationDiagnostics(
  diagnostics: readonly ReactComponentDeclarationDiagnostic[],
) {
  return [
    'React 组件声明检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.name} 应使用 function 声明`
    )),
  ].join('\n')
}

/**
 * 断言 React 组件均使用 function 声明
 */
export async function assertReactComponentDeclarations(sources: readonly TypeScriptSource[]) {
  const diagnostics = await readReactComponentDeclarationDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatReactComponentDeclarationDiagnostics(diagnostics))
}

/** -------------------- 内部函数 -------------------- */
function readLexicalScope(node: ts.Node) {
  let current: ts.Node = node

  while (!isClassNameScope(current))
    current = current.parent

  return current
}

function readParentLexicalScope(scope: ts.Node) {
  let current = scope.parent

  while (current && !isClassNameScope(current))
    current = current.parent

  return current
}

function readParameterScope(parameter: ts.ParameterDeclaration) {
  const parent = parameter.parent

  return isFunctionLikeScope(parent) ? parent : undefined
}

/**
 * 读取变量声明实际拥有绑定的词法作用域
 */
function readBindingScope(declaration: ts.VariableDeclaration) {
  const parent = declaration.parent

  if (ts.isCatchClause(parent))
    return parent.block

  if (ts.isVariableDeclarationList(parent)) {
    const owner = parent.parent
    const isBlockScoped = (parent.flags & ts.NodeFlags.BlockScoped) !== 0

    if (
      isBlockScoped
      && (
        ts.isForStatement(owner)
        || ts.isForInStatement(owner)
        || ts.isForOfStatement(owner)
      )
    ) {
      return owner
    }

    if (!isBlockScoped) {
      let scope: ts.Node = owner

      while (!ts.isSourceFile(scope) && !isFunctionLikeScope(scope))
        scope = scope.parent

      return scope
    }
  }

  return readLexicalScope(declaration)
}

function isClassNameScope(node: ts.Node) {
  return ts.isSourceFile(node)
    || ts.isBlock(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || isFunctionLikeScope(node)
}

function isFunctionLikeScope(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isArrowFunction(node)
    || ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
}

function readComponentFunction(
  expression: ts.Expression,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  const current = unwrapExpression(expression)

  if (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
    return current

  if (!ts.isCallExpression(current))
    return

  const wrapperName = ts.isIdentifier(current.expression)
    ? current.expression.text
    : ts.isPropertyAccessExpression(current.expression)
      ? current.expression.name.text
      : undefined
  const [candidate] = current.arguments

  if (
    !wrapperName
    || !['forwardRef', 'memo'].includes(wrapperName)
    || !candidate
    || ts.isSpreadElement(candidate)
  ) {
    return
  }

  return readComponentFunction(candidate)
}

function hasReactReturn(
  fn: ts.ArrowFunction | ts.FunctionExpression,
  context: ReactOutputContext,
) {
  if (!ts.isBlock(fn.body))
    return isReactOutput(fn.body, context)

  let matched = false
  const visit = (node: ts.Node) => {
    if (
      matched
      || (
        node !== fn.body
        && (
          ts.isArrowFunction(node)
          || ts.isFunctionExpression(node)
          || ts.isFunctionDeclaration(node)
        )
      )
    ) {
      return
    }

    if (
      ts.isReturnStatement(node)
      && node.expression
      && isReactOutput(node.expression, context)
    ) {
      matched = true
      return
    }

    node.forEachChild(visit)
  }

  visit(fn.body)
  return matched
}

function isReactOutput(expression: ts.Expression, context: ReactOutputContext): boolean {
  const current = unwrapExpression(expression)

  if (
    ts.isJsxElement(current)
    || ts.isJsxFragment(current)
    || ts.isJsxSelfClosingElement(current)
  ) {
    return true
  }

  if (ts.isConditionalExpression(current))
    return isReactOutput(current.whenTrue, context) || isReactOutput(current.whenFalse, context)

  if (
    ts.isBinaryExpression(current)
    && (
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      || current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    )
  ) {
    return isReactOutput(current.right, context)
  }

  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some(element => (
      !ts.isSpreadElement(element) && isReactOutput(element, context)
    ))
  }

  if (!ts.isCallExpression(current))
    return false

  return (
    ts.isIdentifier(current.expression)
    && isReactImportReference(current.expression, context.createElementImports, context)
  )
  || (
    ts.isPropertyAccessExpression(current.expression)
    && ts.isIdentifier(current.expression.expression)
    && isReactImportReference(current.expression.expression, context.namespaceImports, context)
    && current.expression.name.text === 'createElement'
  )
}

function readReactOutputContext(sourceFile: ts.SourceFile): ReactOutputContext {
  const bindingsByScope = new Map<ts.Node, Map<string, ts.Node[]>>()
  const createElementImports = new Map<string, ts.Node>()
  const namespaceImports = new Map<string, ts.Node>()
  const addBinding = (scope: ts.Node, name: ts.BindingName, declaration: ts.Node) => {
    if (!ts.isIdentifier(name)) {
      for (const element of name.elements) {
        if (!ts.isOmittedExpression(element) && element.name)
          addBinding(scope, element.name, element)
      }
      return
    }

    const bindings = bindingsByScope.get(scope) ?? new Map<string, ts.Node[]>()
    const namedBindings = bindings.get(name.text) ?? []

    namedBindings.push(declaration)
    bindings.set(name.text, namedBindings)
    bindingsByScope.set(scope, bindings)
  }

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'react'
      || !statement.importClause
    ) {
      continue
    }

    if (statement.importClause.name) {
      addBinding(sourceFile, statement.importClause.name, statement.importClause)
      namespaceImports.set(statement.importClause.name.text, statement.importClause)
    }

    const bindings = statement.importClause.namedBindings

    if (bindings && ts.isNamespaceImport(bindings)) {
      addBinding(sourceFile, bindings.name, bindings)
      namespaceImports.set(bindings.name.text, bindings)
    }
    else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        addBinding(sourceFile, element.name, element)

        if ((element.propertyName?.text ?? element.name.text) === 'createElement')
          createElementImports.set(element.name.text, element)
      }
    }
  }

  const indexLexicalBindings = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      addBinding(readBindingScope(node), node.name, node)
    }
    else if (ts.isParameterDeclaration(node)) {
      const scope = readParameterScope(node)

      if (scope)
        addBinding(scope, node.name, node)
    }

    node.forEachChild(indexLexicalBindings)
  }

  indexLexicalBindings(sourceFile)
  return { bindingsByScope, createElementImports, namespaceImports }
}

function isReactImportReference(
  identifier: ts.Identifier,
  imports: ReadonlyMap<string, ts.Node>,
  context: ReactOutputContext,
) {
  const importBinding = imports.get(identifier.text)

  if (!importBinding)
    return false

  let scope: ts.Node | undefined = readLexicalScope(identifier)

  while (scope) {
    const binding = context.bindingsByScope.get(scope)?.get(identifier.text)?.at(-1)

    if (binding)
      return binding === importBinding

    scope = readParentLexicalScope(scope)
  }

  return false
}
