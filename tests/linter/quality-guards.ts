import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'

/** -------------------- 类型 -------------------- */
/** 待守卫检查的 TypeScript 源码 */
export interface TypeScriptSource {
  /** 仓库相对路径 */
  filePath: string
  /** 源码文本 */
  source: string
}

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

/** 模块 index 出口诊断 */
export interface ModuleIndexDiagnostic {
  /** 缺少显式出口的模块目录 */
  directoryPath: string
  /** 诊断文件 */
  filePath: string
}

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

/** React 组件声明诊断 */
export interface ReactComponentDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 组件名称 */
  name: string
  /** 诊断行号 */
  line: number
}

/** React Hook 阶段顺序诊断 */
export interface ReactHookOrderDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 逆序 Hook 名称 */
  hookName: string
  /** 诊断行号 */
  line: number
  /** 所属组件或 Hook */
  scope: string
}

/** className 动态组合诊断 */
export interface ClassNameDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind: 'array-composition' | 'dynamic-template' | 'string-concatenation'
  /** 诊断行号 */
  line: number
}

/** 测试文件位置诊断 */
export interface TestLocationDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind: 'missing-domain-directory' | 'outside-tests'
}

/** 全仓质量诊断 */
export interface RepositoryQualityDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 守卫名称 */
  rule: string
  /** 可读诊断信息 */
  message: string
}

interface ParsedTypeScriptSource extends TypeScriptSource {
  sourceFile: ts.SourceFile
}

interface HookOrderItem {
  isHook: boolean
  name: string
  node: ts.Node
  rank: number
}

interface ClassNameBinding {
  initializer?: ts.Expression
  node: ts.Node
}

interface ReactOutputContext {
  createElementNames: ReadonlySet<string>
  namespaceNames: ReadonlySet<string>
}

/** -------------------- 常量 -------------------- */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const ignoredDirectoryNames = new Set([
  '.cache',
  '.git',
  '.pnpm-store',
  '.tanstack',
  '.tmp',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
])
const stateHookNames = new Set([
  'useImperativeHandle',
  'useReducer',
  'useRef',
  'useState',
  'useTransition',
])
const memoHookNames = new Set(['useCallback', 'useMemo'])

/** -------------------- AST 工具 -------------------- */
/** 将受控源码解析为真实 TypeScript AST */
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

/** 枚举仓库 TypeScript 源码并排除生成、依赖、构建和负 fixture */
export function readRepositoryTypeScriptSources(
  sourceRoots: readonly string[] = ['packages', 'projects', 'tests'],
  root = repositoryRoot,
) {
  const sources: TypeScriptSource[] = []

  const collect = (directoryPath: string) => {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name))
        continue

      const absolutePath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        const relativeDirectory = toPosixPath(path.relative(root, absolutePath))

        if (relativeDirectory === 'tests/linter/fixtures')
          continue

        collect(absolutePath)
        continue
      }

      if (
        !entry.isFile()
        || !/\.tsx?$/.test(entry.name)
        || entry.name === 'routeTree.gen.ts'
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

/** -------------------- 显式导出 -------------------- */
/** 检查源码 default、星号导出以及缺少命名导出的模块 */
export function readExplicitExportDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ExplicitExportDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
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

      const modifiers = ts.canHaveModifiers(statement)
        ? ts.getModifiers(statement)
        : undefined
      const exported = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      const defaultExport = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)

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
        const defaultExport = statement.exportClause.elements.some(element => (
          element.name.text === 'default'
        ))

        if (defaultExport) {
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
      && !/(?:^|\/)main\.tsx?$/.test(filePath)
      && !filePath.endsWith('.d.ts')
    ) {
      diagnostics.push({ column: 1, filePath, kind: 'missing-named-export', line: 1 })
    }
  }

  return diagnostics
}

/** -------------------- Interface 注释 -------------------- */
/** 检查导出 Interface 声明和成员是否具有 JSDoc */
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

/** -------------------- 模块目录 -------------------- */
/** 检查真正源码模块目录是否提供显式 index.ts 或 index.tsx */
export function readModuleIndexDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const implementationPaths = sources
    .map(item => item.filePath)
    .filter(filePath => /\/src\//.test(filePath) && !filePath.endsWith('.d.ts'))
  const fileNamesByDirectory = new Map<string, Set<string>>()

  for (const filePath of implementationPaths) {
    const sourceRoot = filePath.match(/^(?:packages|projects)\/[^/]+\/src(?:\/|$)/)?.[0]
      .replace(/\/$/, '')

    if (!sourceRoot)
      continue

    const leafDirectory = path.posix.dirname(filePath)
    let directoryPath = leafDirectory

    while (directoryPath.startsWith(sourceRoot)) {
      const names = fileNamesByDirectory.get(directoryPath) ?? new Set<string>()

      if (directoryPath === leafDirectory)
        names.add(path.posix.basename(filePath))

      fileNamesByDirectory.set(directoryPath, names)

      if (directoryPath === sourceRoot)
        break

      directoryPath = path.posix.dirname(directoryPath)
    }
  }

  const diagnostics: ModuleIndexDiagnostic[] = []

  for (const [directoryPath, fileNames] of fileNamesByDirectory) {
    if (
      isEntryProjectSourceRoot(directoryPath, fileNames)
      || isTanStackRoutesDirectory(directoryPath)
      || fileNames.has('index.ts')
      || fileNames.has('index.tsx')
    ) {
      continue
    }

    const filePath = implementationPaths.find(item => (
      path.posix.dirname(item) === directoryPath
      || item.startsWith(`${directoryPath}/`)
    ))

    if (filePath)
      diagnostics.push({ directoryPath, filePath })
  }

  return diagnostics.sort((left, right) => left.directoryPath.localeCompare(right.directoryPath))
}

/** -------------------- 类成员 -------------------- */
/** 检查显式 private 成员及构造器参数属性的下划线前缀 */
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

  return diagnostics
}

/** -------------------- React -------------------- */
/** 检查 PascalCase React 组件是否使用 function 声明 */
export function readReactComponentDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ReactComponentDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
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

/** 检查组件和自定义 Hook 内 common、state、memo、事件与 Effect 的阶段顺序 */
export function readReactHookOrderDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ReactHookOrderDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    const reactOutputContext = readReactOutputContext(sourceFile)
    const inspect = (scope: string, body: ts.ConciseBody) => {
      if (!ts.isBlock(body))
        return

      let latestRank = 0

      for (const statement of body.statements) {
        for (const item of readHookOrderItems(statement)) {
          if (item.isHook && item.rank < latestRank) {
            diagnostics.push({
              ...positionOf(sourceFile, item.node),
              filePath,
              hookName: item.name,
              scope,
            })
          }

          latestRank = Math.max(latestRank, item.rank)
        }
      }
    }

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const name = node.name.text

        if (/^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name))
          inspect(name, node.body)
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

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics
}

/** -------------------- className -------------------- */
/** 检查 className 是否通过 cn 组合动态 Tailwind 候选 */
export function readClassNameDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ClassNameDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    const declarationsByScope = new Map<
      ts.Node,
      Map<string, ClassNameBinding[]>
    >()

    const addBinding = (
      scope: ts.Node,
      name: ts.BindingName,
      binding: ClassNameBinding,
    ) => {
      if (!ts.isIdentifier(name)) {
        for (const element of name.elements) {
          if (!ts.isOmittedExpression(element))
            addBinding(scope, element.name, { node: element })
        }
        return
      }

      const declarations = declarationsByScope.get(scope) ?? new Map<
        string,
        ClassNameBinding[]
      >()
      const namedDeclarations = declarations.get(name.text) ?? []

      namedDeclarations.push(binding)
      declarations.set(name.text, namedDeclarations)
      declarationsByScope.set(scope, declarations)
    }

    const indexInitializers = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node)) {
        addBinding(readLexicalScope(node), node.name, {
          initializer: node.initializer,
          node,
        })
      }
      else if (ts.isParameter(node)) {
        const scope = readParameterScope(node)

        if (scope)
          addBinding(scope, node.name, { node })
      }

      node.forEachChild(indexInitializers)
    }

    indexInitializers(sourceFile)

    const resolveInitializer = (identifier: ts.Identifier) => {
      let scope: ts.Node | undefined = readLexicalScope(identifier)

      while (scope) {
        const declaration = declarationsByScope.get(scope)
          ?.get(identifier.text)
          ?.filter(item => item.node.getStart(sourceFile) < identifier.getStart(sourceFile))
          .at(-1)

        if (declaration)
          return declaration

        scope = readParentLexicalScope(scope)
      }
    }

    const inspect = (
      expression: ts.Expression,
      activeDeclarations = new Set<ts.Node>(),
    ) => {
      const current = unwrapExpression(expression)

      if (ts.isIdentifier(current)) {
        const declaration = resolveInitializer(current)

        if (declaration?.initializer && !activeDeclarations.has(declaration.node)) {
          activeDeclarations.add(declaration.node)
          inspect(declaration.initializer, activeDeclarations)
          activeDeclarations.delete(declaration.node)
        }
        return
      }

      if (
        ts.isCallExpression(current)
        && ts.isIdentifier(current.expression)
        && current.expression.text === 'cn'
      ) {
        for (const argument of current.arguments) {
          inspect(
            ts.isSpreadElement(argument) ? argument.expression : argument,
            activeDeclarations,
          )
        }
        return
      }

      if (isArrayClassComposition(current)) {
        diagnostics.push({
          ...positionOf(sourceFile, current),
          filePath,
          kind: 'array-composition',
        })
        return
      }

      if (ts.isTemplateExpression(current)) {
        diagnostics.push({
          ...positionOf(sourceFile, current),
          filePath,
          kind: 'dynamic-template',
        })
        return
      }

      if (
        ts.isBinaryExpression(current)
        && current.operatorToken.kind === ts.SyntaxKind.PlusToken
      ) {
        diagnostics.push({
          ...positionOf(sourceFile, current),
          filePath,
          kind: 'string-concatenation',
        })
        return
      }

      if (ts.isObjectLiteralExpression(current)) {
        for (const property of current.properties) {
          if (ts.isSpreadAssignment(property))
            inspect(property.expression, activeDeclarations)
          else if (ts.isPropertyAssignment(property) && ts.isComputedPropertyName(property.name))
            inspect(property.name.expression, activeDeclarations)
        }
        return
      }

      if (ts.isArrayLiteralExpression(current)) {
        for (const element of current.elements) {
          if (!ts.isOmittedExpression(element)) {
            inspect(
              ts.isSpreadElement(element) ? element.expression : element,
              activeDeclarations,
            )
          }
        }
        return
      }

      if (ts.isConditionalExpression(current)) {
        inspect(current.whenTrue, activeDeclarations)
        inspect(current.whenFalse, activeDeclarations)
        return
      }

      if (
        ts.isBinaryExpression(current)
        && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        inspect(current.right, activeDeclarations)
        return
      }

      const inspectChild = (child: ts.Node) => {
        if (ts.isExpression(child)) {
          inspect(child, activeDeclarations)
          return
        }

        child.forEachChild(inspectChild)
      }

      current.forEachChild(inspectChild)
    }

    const visit = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node)
        && node.name.getText(sourceFile) === 'className'
        && node.initializer
      ) {
        if (ts.isJsxExpression(node.initializer) && node.initializer.expression)
          inspect(node.initializer.expression)
      }

      if (
        ts.isPropertyAssignment(node)
        && node.name.getText(sourceFile).replaceAll(/['"]/g, '') === 'className'
      ) {
        inspect(node.initializer)
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/** -------------------- 测试位置 -------------------- */
/** 检查测试文件是否位于 tests 下的领域目录 */
export function readTestLocationDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TestLocationDiagnostic[] = []

  for (const { filePath } of sources) {
    if (!/\.(?:spec|test)\.tsx?$/.test(filePath))
      continue

    if (!filePath.startsWith('tests/')) {
      diagnostics.push({ filePath, kind: 'outside-tests' })
    }
    else if (/^tests\/[^/]+$/.test(filePath)) {
      diagnostics.push({ filePath, kind: 'missing-domain-directory' })
    }
  }

  return diagnostics
}

/** -------------------- 全仓 Gate -------------------- */
/** 对真实仓库执行全部通用 TypeScript AST 质量守卫 */
export function scanRepositoryQuality(root = repositoryRoot) {
  const allSources = readRepositoryTypeScriptSources(undefined, root)
  const productionSources = allSources.filter(item => (
    (item.filePath.startsWith('packages/') || item.filePath.startsWith('projects/'))
    && item.filePath.includes('/src/')
    && !item.filePath.endsWith('.d.ts')
  ))
  const diagnostics: RepositoryQualityDiagnostic[] = []

  appendDiagnostics(diagnostics, 'explicit-exports', readExplicitExportDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'interface-comments', readInterfaceCommentDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'module-index', readModuleIndexDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'private-members', readPrivateMemberDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'react-components', readReactComponentDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'react-hook-order', readReactHookOrderDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'class-name', readClassNameDiagnostics(productionSources))
  appendDiagnostics(diagnostics, 'test-location', readTestLocationDiagnostics(allSources))

  return diagnostics
}

/** -------------------- 内部函数 -------------------- */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function positionOf(sourceFile: ts.SourceFile, node: ts.Node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

  return {
    column: position.character + 1,
    line: position.line + 1,
  }
}

function comparePositionedDiagnostics(
  left: { column: number, filePath: string, line: number },
  right: { column: number, filePath: string, line: number },
) {
  return left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.column - right.column
}

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

function isClassNameScope(node: ts.Node) {
  return ts.isSourceFile(node) || ts.isBlock(node) || isFunctionLikeScope(node)
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

function isEntryProjectSourceRoot(
  directoryPath: string,
  fileNames: ReadonlySet<string>,
) {
  return /^projects\/[^/]+\/src$/.test(directoryPath)
    && (fileNames.has('main.ts') || fileNames.has('main.tsx'))
}

function isTanStackRoutesDirectory(directoryPath: string) {
  return /^projects\/(?:admin|client)\/src\/routes(?:\/|$)/.test(directoryPath)
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

function readHookOrderItems(statement: ts.Statement) {
  const items: HookOrderItem[] = []

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) {
        items.push({
          isHook: false,
          name: declaration.name.getText(),
          node: declaration,
          rank: 4,
        })
      }
    }
  }
  else if (ts.isFunctionDeclaration(statement)) {
    items.push({
      isHook: false,
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
          isHook: true,
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
  if (name.endsWith('Effect'))
    return 6
  if (memoHookNames.has(name))
    return 3
  if (stateHookNames.has(name))
    return 2
  return 1
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
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
    && context.createElementNames.has(current.expression.text)
  )
  || (
    ts.isPropertyAccessExpression(current.expression)
    && ts.isIdentifier(current.expression.expression)
    && context.namespaceNames.has(current.expression.expression.text)
    && current.expression.name.text === 'createElement'
  )
}

function readReactOutputContext(sourceFile: ts.SourceFile): ReactOutputContext {
  const createElementNames = new Set<string>()
  const namespaceNames = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'react'
      || !statement.importClause
    ) {
      continue
    }

    if (statement.importClause.name)
      namespaceNames.add(statement.importClause.name.text)

    const bindings = statement.importClause.namedBindings

    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceNames.add(bindings.name.text)
    }
    else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === 'createElement')
          createElementNames.add(element.name.text)
      }
    }
  }

  return { createElementNames, namespaceNames }
}

function isArrayClassComposition(expression: ts.Expression) {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression))
    return false

  const methodName = expression.expression.name.text

  if (methodName === 'join') {
    const [separator] = expression.arguments

    return separator !== undefined
      && ts.isStringLiteralLike(separator)
      && separator.text === ' '
  }

  if (methodName !== 'filter')
    return false

  const [predicate] = expression.arguments
  return predicate !== undefined && ts.isIdentifier(predicate) && predicate.text === 'Boolean'
}

function appendDiagnostics(
  target: RepositoryQualityDiagnostic[],
  rule: string,
  diagnostics: readonly object[],
) {
  for (const diagnostic of diagnostics) {
    const record = diagnostic as { filePath?: string }

    target.push({
      filePath: record.filePath ?? '<unknown>',
      message: JSON.stringify(diagnostic),
      rule,
    })
  }
}
