import type { TypeScriptSource } from './source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import { unwrapExpression } from './ast'
import { parseTypeScriptSources, positionOf, repositoryIgnoredDirNames, repositoryIgnoredFileNames } from './source'

/** -------------------- 类型 -------------------- */
/** React Hook 阶段顺序诊断 */
export interface ReactHookOrderDiagnostic {
  /** 命令式屏障说明 */
  barrier?: string
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 逆序 Hook 名称 */
  hookName: string
  /** 违规类型 */
  kind: 'imperative-barrier' | 'stage-order'
  /** 诊断行号 */
  line: number
  /** 所属组件或 Hook */
  scope: string
}

interface HookOrderItem {
  name: string
  node: ts.Node
  rank: number
}

interface HookBarrier {
  /** 命令式语句说明 */
  label: string
}

interface ReactOutputContext {
  bindingsByScope: ReadonlyMap<ts.Node, ReadonlyMap<string, readonly ts.Node[]>>
  createElementImports: ReadonlyMap<string, ts.Node>
  namespaceImports: ReadonlyMap<string, ts.Node>
}

/** -------------------- 常量 -------------------- */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const stateHookNames = new Set([
  'useBoolean',
  'useForm',
  'useImperativeHandle',
  'useImmer',
  'useLatest',
  'useMap',
  'useReducer',
  'useRef',
  'useResizeObserver',
  'useSet',
  'useState',
  'useStorage',
  'useTransition',
  'useVirtualizer',
  'useWatch',
])
const memoHookNames = new Set(['useCallback', 'useMemo'])
const eventHookNames = new Set([
  'useDebounce',
  'useDebounceFn',
  'useEvent',
  'useMutation',
])
const effectHookNames = new Set([
  'useEventListener',
  'useInterval',
  'useMount',
  'useResizeObservers',
  'useTimeout',
  'useUnmount',
])
const reactHookSourceRoots = [
  'packages/shared-ui/src',
  'projects/admin/src',
  'projects/client/src',
] as const

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 React Hook 守卫扫描目标源码
 */
export function readReactHookSources(): TypeScriptSource[] {
  return readRepositoryTypeScriptSources(reactHookSourceRoots)
    .filter(item => !item.filePath.endsWith('.d.ts'))
}

export async function readReactHookOrderDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ReactHookOrderDiagnostic[] = []

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    const reactOutputContext = readReactOutputContext(sourceFile)
    const inspectedBodies = new Set<ts.Block>()
    const inspect = (scope: string, body: ts.ConciseBody) => {
      if (!ts.isBlock(body) || inspectedBodies.has(body))
        return

      inspectedBodies.add(body)
      let barrier: HookBarrier | undefined
      let latestItem: HookOrderItem | undefined

      for (const statement of body.statements) {
        const items = readHookOrderItems(statement)

        for (const item of items) {
          if (barrier && item.rank !== 4) {
            diagnostics.push({
              ...positionOf(sourceFile, item.node),
              barrier: barrier.label,
              filePath,
              hookName: item.name,
              kind: 'imperative-barrier',
              scope,
            })
            continue
          }

          if (latestItem && item.rank < latestItem.rank) {
            diagnostics.push({
              ...positionOf(sourceFile, item.node),
              filePath,
              hookName: item.name,
              kind: 'stage-order',
              scope,
            })
            continue
          }

          latestItem = item
        }

        barrier ??= readHookBarrier(statement, items)
      }
    }

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.body) {
        const name = node.name?.text
        const defaultExport = hasModifier(node, ts.SyntaxKind.DefaultKeyword)

        if (
          (name && (/^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name)))
          || defaultExport
        ) {
          inspect(name ?? 'default export', node.body)
        }
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
      ) {
        const name = node.name.text
        const fn = readComponentFunction(node.initializer)

        if (
          fn
          && (
            /^use[A-Z0-9]/.test(name)
            || (/^[A-Z]/.test(name) && hasReactReturn(fn, reactOutputContext))
          )
        ) {
          inspect(name, fn.body)
        }
      }

      if (ts.isExportAssignment(node)) {
        const fn = readComponentFunction(node.expression)

        if (fn) {
          inspect(
            ts.isFunctionExpression(fn)
              ? fn.name?.text ?? 'default export'
              : 'default export',
            fn.body,
          )
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics
}

/** -------------------- className -------------------- */
/** 检查 className 是否通过 cn 组合动态 Tailwind 候选 */

/**
 * 格式化 React Hook 阶段顺序诊断
 */
export function formatReactHookOrderDiagnostics(
  diagnostics: readonly ReactHookOrderDiagnostic[],
) {
  return [
    'React Hook 阶段顺序检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.scope} 中的 ${item.hookName} 顺序不正确`
    )),
  ].join('\n')
}

/**
 * 断言 React Hook 阶段顺序符合约定
 */
export async function assertReactHookOrder(sources: readonly TypeScriptSource[]) {
  const diagnostics = await readReactHookOrderDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatReactHookOrderDiagnostics(diagnostics))
}

/** -------------------- 内部函数 -------------------- */
function readRepositoryTypeScriptSources(
  sourceRoots: readonly string[] = ['packages', 'projects', 'tests'],
  root = repositoryRoot,
) {
  const sources: TypeScriptSource[] = []

  const collect = (directoryPath: string) => {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isDirectory() && repositoryIgnoredDirNames.has(entry.name))
        continue

      const absolutePath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        collect(absolutePath)
        continue
      }

      if (
        !entry.isFile()
        || !/\.tsx?$/.test(entry.name)
        || repositoryIgnoredFileNames.has(entry.name)
      ) {
        continue
      }

      sources.push({
        filePath: toPosixPath(path.relative(root, absolutePath)),
        source: readFileSync(absolutePath, 'utf8'),
      })
    }
  }

  for (const sourceRoot of sourceRoots)
    collect(path.resolve(root, sourceRoot))

  return sources.sort((left, right) => left.filePath.localeCompare(right.filePath))
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  const modifiers = (node as ts.Node & {
    readonly modifiers?: readonly ts.ModifierLike[]
  }).modifiers

  return modifiers?.some(modifier => modifier.kind === kind) === true
}

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

function readHookOrderItems(statement: ts.Statement) {
  const items: HookOrderItem[] = []

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer
        && (
          ts.isArrowFunction(declaration.initializer)
          || ts.isFunctionExpression(declaration.initializer)
        )
      ) {
        items.push({
          name: declaration.name.getText(),
          node: declaration,
          rank: 4,
        })
      }
    }
  }
  else if (ts.isFunctionDeclaration(statement)) {
    items.push({
      name: statement.name?.text ?? '<anonymous>',
      node: statement,
      rank: 4,
    })
  }

  const visit = (node: ts.Node) => {
    if (
      node !== statement
      && (
        ts.isArrowFunction(node)
        || ts.isFunctionExpression(node)
        || ts.isFunctionDeclaration(node)
      )
    ) {
      return
    }

    if (ts.isCallExpression(node)) {
      const hookName = readHookName(node)

      if (hookName) {
        items.push({
          name: hookName,
          node,
          rank: readHookRank(hookName),
        })
      }
    }

    node.forEachChild(visit)
  }

  visit(statement)
  return items.sort((left, right) => left.node.getStart() - right.node.getStart())
}

/**
 * 读取会阻断后续 Hook 阶段的命令式语句
 */
function readHookBarrier(
  statement: ts.Statement,
  items: readonly HookOrderItem[],
): HookBarrier | undefined {
  if (items.length > 0 || ts.isVariableStatement(statement))
    return

  if (
    ts.isInterfaceDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement)
    || ts.isEmptyStatement(statement)
  ) {
    return
  }

  return {
    label: ts.isReturnStatement(statement)
      ? 'return'
      : `命令式 ${ts.SyntaxKind[statement.kind]}`,
  }
}

function readHookName(call: ts.CallExpression) {
  const name = ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : undefined

  return name === 'use' || (name && /^use[A-Z0-9]/.test(name))
    ? name
    : undefined
}

function readHookRank(name: string) {
  if (name === 'useEffectEvent')
    return 5
  if (effectHookNames.has(name) || name.endsWith('Effect'))
    return 6
  if (memoHookNames.has(name))
    return 3
  if (stateHookNames.has(name))
    return 2
  if (eventHookNames.has(name))
    return 4
  return 1
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
