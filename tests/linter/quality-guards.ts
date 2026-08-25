import type { TypeScriptSource } from './quality-guard-source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'
import { createClassNameModuleResolver } from './class-name-modules'
import {
  comparePositionedDiagnostics,
  isTanStackRoutesDirectory,
  parseTypeScriptSources,
  positionOf,
  unwrapExpression,
} from './quality-guard-source'
import {
  repositoryIgnoredDirNames,
  repositoryIgnoredFileNames,
} from './repository-paths'
import {
  readCustomHookModuleDiagnostics,
  readModuleDirectoryLayoutDiagnostics,
  readTestStructureDiagnostics,
} from './structure-guards'

export { parseTypeScriptSources }
export type { TypeScriptSource } from './quality-guard-source'
export {
  readCustomHookModuleDiagnostics,
  readModuleDirectoryLayoutDiagnostics,
  readTestStructureDiagnostics,
}
export type {
  CustomHookModuleDiagnostic,
  ModuleDirectoryLayoutDiagnostic,
  TestStructureDiagnostic,
} from './structure-guards'

/** -------------------- 类型 -------------------- */
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

/** className 动态组合诊断 */
export interface ClassNameDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind:
    | 'array-composition'
    | 'dynamic-template'
    | 'inline-multiline-class-attribute'
    | 'long-cn-single-line'
    | 'long-static-class'
    | 'root-only-class-names'
    | 'short-static-cn'
    | 'single-use-class-constant'
    | 'string-concatenation'
    | 'unbalanced-cn-segments'
  /** 诊断行号 */
  line: number
  /** className、classNames 或样式常量名称 */
  target?: string
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

interface HookOrderItem {
  name: string
  node: ts.Node
  rank: number
}

interface HookBarrier {
  /** 命令式语句说明 */
  label: string
}

interface ClassNameBinding {
  initializer?: ts.Expression
  node: ts.Node
}

interface ClassNameConstantRecord {
  /** 样式常量声明 */
  declaration: ts.VariableDeclaration
  /** 声明所在文件 */
  filePath: string
  /** 样式常量名称 */
  name: string
  /** 源码消费点数量 */
  references: number
  /** 声明所在源码 */
  sourceFile: ts.SourceFile
}

interface ClassNameLayoutViolation {
  /** 静态布局违规类型 */
  kind:
    | 'long-cn-single-line'
    | 'long-static-class'
    | 'short-static-cn'
    | 'unbalanced-cn-segments'
  /** 静态布局违规节点 */
  node: ts.Node
}

interface ReactOutputContext {
  bindingsByScope: ReadonlyMap<ts.Node, ReadonlyMap<string, readonly ts.Node[]>>
  createElementImports: ReadonlyMap<string, ts.Node>
  namespaceImports: ReadonlyMap<string, ts.Node>
}

/** -------------------- 常量 -------------------- */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
/** React 与常用工具库的 state / ref Hook */
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
/** React memo Hook */
const memoHookNames = new Set(['useCallback', 'useMemo'])
/** 返回稳定事件动作的通用 Hook */
const eventHookNames = new Set([
  'useDebounce',
  'useDebounceFn',
  'useEvent',
  'useMutation',
])
/** 名称不带 Effect 但负责注册副作用的通用 Hook */
const effectHookNames = new Set([
  'useEventListener',
  'useInterval',
  'useMount',
  'useResizeObservers',
  'useTimeout',
  'useUnmount',
])
/** 静态 class 字符串保持单行的最大字符数 */
const maxStaticClassNameLength = 56
/** 普通静态 cn 分组允许的最大字符数差 */
const maxCnSegmentLengthDifference = 32

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
      if (entry.isDirectory() && repositoryIgnoredDirNames.has(entry.name))
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
function readDynamicClassNameDiagnostics(
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
        addBinding(readBindingScope(node), node.name, {
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

/**
 * 检查 className 动态组合、静态布局与样式常量边界
 */
export function readClassNameDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return [
    ...readDynamicClassNameDiagnostics(sources),
    ...readClassNameLayoutDiagnostics(sources),
  ].sort(comparePositionedDiagnostics)
}

/**
 * 检查静态 class 布局、cn 分组、classNames 槽位与样式常量消费数
 */
function readClassNameLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ClassNameDiagnostic[] = []
  const parsedSources = parseTypeScriptSources(sources)
  const declarationsBySourceFile = new Map<
    ts.SourceFile,
    Map<ts.Node, Map<string, ClassNameBinding[]>>
  >()
  const constants: ClassNameConstantRecord[] = []
  const constantByDeclaration = new Map<
    ts.VariableDeclaration,
    ClassNameConstantRecord
  >()

  for (const { filePath, sourceFile } of parsedSources) {
    const declarations = new Map<ts.Node, Map<string, ClassNameBinding[]>>()
    /** 索引单个词法绑定及解构绑定 */
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

      const scoped = declarations.get(scope) ?? new Map<
        string,
        ClassNameBinding[]
      >()
      const named = scoped.get(name.text) ?? []

      named.push(binding)
      scoped.set(name.text, named)
      declarations.set(scope, scoped)
    }
    /** 索引每个词法作用域中的变量与参数绑定 */
    const indexDeclarations = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node)) {
        addBinding(readBindingScope(node), node.name, {
          initializer: node.initializer,
          node,
        })

        if (
          ts.isIdentifier(node.name)
          && node.initializer
          && isClassNameConstant(node.name.text)
        ) {
          const name = node.name.text
          const record: ClassNameConstantRecord = {
            declaration: node,
            filePath,
            name,
            references: 0,
            sourceFile,
          }
          constants.push(record)
          constantByDeclaration.set(node, record)
        }
      }
      else if (ts.isParameter(node)) {
        const scope = readParameterScope(node)

        if (scope)
          addBinding(scope, node.name, { node })
      }

      node.forEachChild(indexDeclarations)
    }

    indexDeclarations(sourceFile)
    declarationsBySourceFile.set(sourceFile, declarations)
  }

  /** 从当前词法作用域向外解析同名局部变量声明 */
  const resolveDeclaration = (
    sourceFile: ts.SourceFile,
    declarations: Map<ts.Node, Map<string, ClassNameBinding[]>>,
    identifier: ts.Identifier,
  ) => {
    let scope: ts.Node | undefined = readLexicalScope(identifier)

    while (scope) {
      const declaration = declarations.get(scope)
        ?.get(identifier.text)
        ?.filter(item => item.node.getStart(sourceFile) < identifier.getStart(sourceFile))
        .at(-1)

      if (declaration)
        return declaration

      scope = readParentLexicalScope(scope)
    }
  }

  const readImportedConstants = createClassNameModuleResolver(
    parsedSources,
    constantByDeclaration,
  )

  for (const { filePath, sourceFile } of parsedSources) {
    const declarations = declarationsBySourceFile.get(sourceFile)!
    const imported = readImportedConstants(filePath)
    /** 统计真实值引用，声明以及导入导出名称不计为消费点 */
    const countReferences = (node: ts.Node) => {
      if (ts.isIdentifier(node) && isIdentifierReference(node)) {
        const binding = resolveDeclaration(sourceFile, declarations, node)
        const record = binding
          ? ts.isVariableDeclaration(binding.node)
            ? constantByDeclaration.get(binding.node)
            : undefined
          : imported.get(node.text)

        if (record)
          record.references += 1
      }

      node.forEachChild(countReferences)
    }

    countReferences(sourceFile)
  }

  for (const record of constants) {
    if (record.references !== 1)
      continue

    diagnostics.push({
      ...positionOf(record.sourceFile, record.declaration),
      filePath: record.filePath,
      kind: 'single-use-class-constant',
      target: record.name,
    })
  }

  for (const { filePath, sourceFile } of parsedSources) {
    const declarations = declarationsBySourceFile.get(sourceFile)!
    const reportedPositions = new Set<number>()
    const reportedRootObjects = new Set<number>()
    /** 从当前词法作用域解析同名局部变量的初始化表达式 */
    const resolveIdentifier = (identifier: ts.Identifier) => (
      resolveDeclaration(sourceFile, declarations, identifier)?.initializer
    )
    /** 报告单个 class 表达式中的静态布局诊断 */
    const inspect = (target: string, expression: ts.Expression) => {
      for (const violation of readClassNameLayoutViolations(
        expression,
        sourceFile,
        resolveIdentifier,
      )) {
        const position = violation.node.getStart(sourceFile)

        if (reportedPositions.has(position))
          continue

        reportedPositions.add(position)
        diagnostics.push({
          ...positionOf(sourceFile, violation.node),
          filePath,
          kind: violation.kind,
          target,
        })
      }
    }
    /** 报告只设置 root 的 classNames 对象并按来源去重 */
    const inspectRootOnly = (
      target: string,
      expression: ts.Expression,
      reportNode: ts.Node,
    ) => {
      const classNames = readRootOnlyClassNames(expression, resolveIdentifier)

      if (!classNames)
        return

      const objectPosition = classNames.getStart(sourceFile)

      if (reportedRootObjects.has(objectPosition))
        return

      reportedRootObjects.add(objectPosition)
      diagnostics.push({
        ...positionOf(sourceFile, reportNode),
        filePath,
        kind: 'root-only-class-names',
        target,
      })
    }
    /** 遍历 JSX、配置字段和显式样式常量 */
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node)) {
        const name = readStaticPropertyName(node.name)

        if (
          (name === 'className' || name === 'classNames')
          && node.initializer
        ) {
          if (ts.isStringLiteral(node.initializer)) {
            inspect(name, node.initializer)
          }
          else if (
            ts.isJsxExpression(node.initializer)
            && node.initializer.expression
          ) {
            inspect(name, node.initializer.expression)

            if (name === 'classNames') {
              inspectRootOnly(name, node.initializer.expression, node)
            }
          }

          const openingElement = node.parent.parent
          const initializerLine = sourceFile.getLineAndCharacterOfPosition(
            node.initializer.getStart(sourceFile),
          ).line
          const openingLine = sourceFile.getLineAndCharacterOfPosition(
            openingElement.getStart(sourceFile),
          ).line

          if (
            node.initializer.getText(sourceFile).includes('\n')
            && initializerLine === openingLine
          ) {
            diagnostics.push({
              ...positionOf(sourceFile, node),
              filePath,
              kind: 'inline-multiline-class-attribute',
              target: name,
            })
          }
        }
      }
      else if (ts.isPropertyAssignment(node)) {
        const name = readStaticPropertyName(node.name)

        if (name === 'className' || name === 'classNames') {
          inspect(name, node.initializer)

          if (name === 'classNames')
            inspectRootOnly(name, node.initializer, node)
        }
      }
      else if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && isClassNameConstant(node.name.text)
      ) {
        inspect(node.name.text, node.initializer)

        if (isClassNamesConstant(node.name.text))
          inspectRootOnly(node.name.text, node.initializer, node)
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

  appendDiagnostics(
    diagnostics,
    'explicit-exports',
    readExplicitExportDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'interface-comments',
    readInterfaceCommentDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'module-index',
    readModuleIndexDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'module-directory-layout',
    readModuleDirectoryLayoutDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'private-members',
    readPrivateMemberDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'react-components',
    readReactComponentDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'react-hook-order',
    readReactHookOrderDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'custom-hook-modules',
    readCustomHookModuleDiagnostics(productionSources),
  )
  appendDiagnostics(
    diagnostics,
    'class-name',
    readClassNameDiagnostics(productionSources),
  )
  appendDiagnostics(diagnostics, 'test-location', readTestLocationDiagnostics(allSources))
  appendDiagnostics(diagnostics, 'test-structure', readTestStructureDiagnostics(allSources))

  return diagnostics
}

/** -------------------- 内部函数 -------------------- */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
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

function isEntryProjectSourceRoot(
  directoryPath: string,
  fileNames: ReadonlySet<string>,
) {
  return /^projects\/[^/]+\/src$/.test(directoryPath)
    && (fileNames.has('main.ts') || fileNames.has('main.tsx'))
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

/**
 * 读取属性或 JSX Attribute 的静态名称
 */
function readStaticPropertyName(name: ts.PropertyName | ts.JsxAttributeName) {
  if (
    ts.isIdentifier(name)
    || ts.isStringLiteral(name)
    || ts.isNumericLiteral(name)
  ) {
    return name.text
  }
}

/**
 * 判断变量是否为显式命名的 className 样式常量
 */
function isClassNameConstant(name: string) {
  return /(?:^|_)CLASS_NAMES?$/.test(name)
}

/**
 * 判断变量是否为显式命名的 classNames 语义样式常量
 */
function isClassNamesConstant(name: string) {
  return /(?:^|_)CLASS_NAMES$/.test(name)
}

/**
 * 判断标识符是否为值引用
 */
function isIdentifierReference(identifier: ts.Identifier) {
  const parent = identifier.parent
  const namedParent = parent as ts.Node & { name?: ts.Node }

  if (
    ts.isBindingElement(parent)
    || ts.isExportSpecifier(parent)
    || ts.isImportSpecifier(parent)
  ) {
    return false
  }

  return namedParent.name !== identifier
    || ts.isShorthandPropertyAssignment(parent)
}

/**
 * 读取静态 class 字符串
 */
function readStaticClassText(node: ts.Node) {
  const current = ts.isExpression(node) ? unwrapExpression(node) : node

  if (
    ts.isStringLiteral(current)
    || ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.text
  }
}

/**
 * 判断静态字符串是否包含多个 class
 */
function hasMultipleClasses(text: string) {
  return text.trim().split(/\s+/).length > 1
}

/**
 * 判断 cn 分组是否包含需要保持完整语义的复杂 utility
 */
function hasComplexClassGroup(text: string) {
  return text.includes('[')
    || text.includes(']')
    || text.split(/\s+/).some(className => className.includes(':'))
}

/**
 * 解析只声明 root 槽位的 classNames 对象
 */
function readRootOnlyClassNames(
  expression: ts.Expression,
  resolveIdentifier: (identifier: ts.Identifier) => ts.Expression | undefined,
  activeIdentifiers = new Set<string>(),
): ts.ObjectLiteralExpression | undefined {
  const current = unwrapExpression(expression)

  if (ts.isIdentifier(current)) {
    if (activeIdentifiers.has(current.text))
      return

    const initializer = resolveIdentifier(current)

    if (!initializer)
      return

    activeIdentifiers.add(current.text)
    const result = readRootOnlyClassNames(
      initializer,
      resolveIdentifier,
      activeIdentifiers,
    )

    activeIdentifiers.delete(current.text)
    return result
  }

  if (!ts.isObjectLiteralExpression(current) || current.properties.length !== 1)
    return

  const [property] = current.properties

  if (
    property
    && (
      ts.isPropertyAssignment(property)
      || ts.isShorthandPropertyAssignment(property)
    )
    && readStaticPropertyName(property.name) === 'root'
  ) {
    return current
  }
}

/**
 * 检查 class 表达式树中的静态布局与 cn 分组
 */
function readClassNameLayoutViolations(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  resolveIdentifier: (identifier: ts.Identifier) => ts.Expression | undefined,
  activeIdentifiers = new Set<string>(),
) {
  const violations: ClassNameLayoutViolation[] = []
  /** 遍历表达式并避免重复解析同名绑定 */
  const visit = (node: ts.Node, insideCn = false) => {
    const current = ts.isExpression(node) ? unwrapExpression(node) : node

    if (ts.isIdentifier(current)) {
      if (activeIdentifiers.has(current.text))
        return

      const initializer = resolveIdentifier(current)

      if (initializer) {
        activeIdentifiers.add(current.text)
        visit(initializer, insideCn)
        activeIdentifiers.delete(current.text)
      }
      return
    }

    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === 'cn'
    ) {
      const staticArguments = current.arguments
        .map(argument => ts.isSpreadElement(argument)
          ? undefined
          : readStaticClassText(argument))
        .filter((text): text is string => text !== undefined)
      const staticLength = staticArguments.join(' ').length
      const allStatic = staticArguments.length === current.arguments.length

      if (
        staticLength > maxStaticClassNameLength
        && !current.getText(sourceFile).includes('\n')
      ) {
        violations.push({ kind: 'long-cn-single-line', node: current })
        return
      }

      if (allStatic && staticLength <= maxStaticClassNameLength) {
        violations.push({ kind: 'short-static-cn', node: current })
        return
      }

      if (
        staticArguments.length >= 2
        && staticArguments.every(text => !hasComplexClassGroup(text))
        && Math.max(...staticArguments.map(text => text.length))
        - Math.min(...staticArguments.map(text => text.length))
        > maxCnSegmentLengthDifference
      ) {
        violations.push({ kind: 'unbalanced-cn-segments', node: current })
        return
      }

      for (const argument of current.arguments) {
        visit(
          ts.isSpreadElement(argument) ? argument.expression : argument,
          true,
        )
      }
      return
    }

    const staticText = readStaticClassText(current)

    if (
      !insideCn
      && staticText
      && staticText.length > maxStaticClassNameLength
      && hasMultipleClasses(staticText)
    ) {
      violations.push({ kind: 'long-static-class', node: current })
      return
    }

    current.forEachChild(child => visit(child, insideCn))
  }

  visit(expression)
  return violations
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
        if (!ts.isOmittedExpression(element))
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
    else if (ts.isParameter(node)) {
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
