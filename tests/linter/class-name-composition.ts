import type { ParsedTypeScriptSource, TypeScriptSource } from './source'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import { unwrapExpression } from './ast'
import { comparePositionedDiagnostics, parseTypeScriptSources, positionOf } from './source'

/** -------------------- 类型 -------------------- */
export interface ClassNameCompositionDiagnostic {
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

/** -------------------- 类型 -------------------- */
interface ModuleImport {
  /** 导入后的模块局部名称 */
  localName: string
  /** 来源模块说明符 */
  moduleSpecifier: string
  /** 来源模块导出名称 */
  sourceName: string
}

interface ModuleExport {
  /** 可选来源模块说明符 */
  moduleSpecifier?: string
  /** 当前出口指向的局部或来源名称 */
  sourceName: string
}

interface ClassNameModule<RecordType> {
  /** 模块级样式常量 */
  constants: Map<string, RecordType>
  /** 声明处直接导出的名称 */
  directExports: Set<string>
  /** 模块文件路径 */
  filePath: string
  /** 显式命名出口 */
  namedExports: Map<string, ModuleExport>
  /** 命名导入 */
  namedImports: Map<string, ModuleImport>
}

/** -------------------- 常量 -------------------- */
/** 静态 class 字符串保持单行的最大字符数 */
export const MAX_STATIC_CLASS_NAME_LENGTH = 56
/** 普通静态 cn 分组允许的最大字符数差 */
export const MAX_CN_SEGMENT_LENGTH_DIFFERENCE = 32
const maxStaticClassNameLength = MAX_STATIC_CLASS_NAME_LENGTH
const maxCnSegmentLengthDifference = MAX_CN_SEGMENT_LENGTH_DIFFERENCE

/** -------------------- 核心函数 -------------------- */
async function readDynamicClassNameCompositionDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ClassNameCompositionDiagnostic[] = []

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
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
          if (!ts.isOmittedExpression(element) && element.name)
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
      else if (ts.isParameterDeclaration(node)) {
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
export async function readClassNameCompositionDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  return [
    ...await readDynamicClassNameCompositionDiagnostics(sources),
    ...await readClassNameLayoutDiagnostics(sources),
  ].sort(comparePositionedDiagnostics)
}

/**
 * 格式化 className 组合与布局诊断
 */
export function formatClassNameCompositionDiagnostics(
  diagnostics: readonly ClassNameCompositionDiagnostic[],
) {
  return [
    'className 组合与布局检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.target ?? 'className'} ${item.kind}`
    )),
  ].join('\n')
}

/**
 * 断言 className 组合与布局符合约定
 */
export async function assertClassNameComposition(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = await readClassNameCompositionDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatClassNameCompositionDiagnostics(diagnostics))
}

/**
 * 检查静态 class 布局、cn 分组、classNames 槽位与样式常量消费数
 */
async function readClassNameLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: ClassNameCompositionDiagnostic[] = []
  const parsedSources = await parseTypeScriptSources(sources)
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
          if (!ts.isOmittedExpression(element) && element.name)
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
      else if (ts.isParameterDeclaration(node)) {
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

/** -------------------- 核心函数 -------------------- */
/**
 * 创建按模块路径追踪显式样式常量出口的导入解析器
 */
function createClassNameModuleResolver<
  RecordType extends { declaration: ts.VariableDeclaration },
>(
  parsedSources: readonly ParsedTypeScriptSource[],
  recordsByDeclaration: ReadonlyMap<ts.VariableDeclaration, RecordType>,
) {
  const modules = new Map<string, ClassNameModule<RecordType>>()

  for (const { filePath, sourceFile } of parsedSources) {
    const normalizedFilePath = normalizeFilePath(filePath)
    const module: ClassNameModule<RecordType> = {
      constants: new Map(),
      directExports: new Set(),
      filePath: normalizedFilePath,
      namedExports: new Map(),
      namedImports: new Map(),
    }

    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        const isExported = statement.modifiers?.some(modifier => (
          modifier.kind === ts.SyntaxKind.ExportKeyword
        )) === true

        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name))
            continue

          const record = recordsByDeclaration.get(declaration)

          if (!record)
            continue

          module.constants.set(declaration.name.text, record)

          if (isExported)
            module.directExports.add(declaration.name.text)
        }
      }
      else if (
        ts.isImportDeclaration(statement)
        && statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
        && statement.importClause?.namedBindings
        && ts.isNamedImports(statement.importClause.namedBindings)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text.startsWith('.')
      ) {
        for (const specifier of statement.importClause.namedBindings.elements) {
          if (specifier.isTypeOnly)
            continue

          module.namedImports.set(specifier.name.text, {
            localName: specifier.name.text,
            moduleSpecifier: statement.moduleSpecifier.text,
            sourceName: specifier.propertyName?.text ?? specifier.name.text,
          })
        }
      }
      else if (
        ts.isExportDeclaration(statement)
        && !statement.isTypeOnly
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
      ) {
        const moduleSpecifier = statement.moduleSpecifier

        if (
          moduleSpecifier
          && (
            !ts.isStringLiteral(moduleSpecifier)
            || !moduleSpecifier.text.startsWith('.')
          )
        ) {
          continue
        }

        for (const specifier of statement.exportClause.elements) {
          if (specifier.isTypeOnly)
            continue

          module.namedExports.set(specifier.name.text, {
            moduleSpecifier: moduleSpecifier?.text,
            sourceName: specifier.propertyName?.text ?? specifier.name.text,
          })
        }
      }
    }

    modules.set(normalizedFilePath, module)
  }

  /**
   * 解析相对说明符指向的受检源码
   */
  function resolveModulePath(filePath: string, specifier: string) {
    const targetPath = path.posix.normalize(path.posix.join(
      path.posix.dirname(filePath),
      specifier,
    ))
    const runtimeExtension = targetPath.match(/\.(?:c|m)?jsx?$/)?.[0]
    const sourceBase = runtimeExtension
      ? targetPath.slice(0, -runtimeExtension.length)
      : targetPath
    const candidates = [
      targetPath,
      `${sourceBase}.ts`,
      `${sourceBase}.tsx`,
      `${sourceBase}.mts`,
      `${sourceBase}.cts`,
      `${targetPath}/index.ts`,
      `${targetPath}/index.tsx`,
      `${targetPath}/index.mts`,
      `${targetPath}/index.cts`,
    ]

    return candidates.find(candidate => modules.has(candidate))
  }

  /**
   * 沿显式命名出口解析最终模块级样式常量
   */
  function resolveExport(
    filePath: string,
    exportName: string,
    resolving: Set<string>,
  ): RecordType | undefined {
    const resolutionKey = `${filePath}\0${exportName}`

    if (resolving.has(resolutionKey))
      return

    resolving.add(resolutionKey)

    const module = modules.get(filePath)
    let record = module?.directExports.has(exportName)
      ? module.constants.get(exportName)
      : undefined
    const namedExport = module?.namedExports.get(exportName)

    if (!record && module && namedExport) {
      if (namedExport.moduleSpecifier) {
        const targetFilePath = resolveModulePath(
          module.filePath,
          namedExport.moduleSpecifier,
        )

        if (targetFilePath) {
          record = resolveExport(
            targetFilePath,
            namedExport.sourceName,
            resolving,
          )
        }
      }
      else {
        record = module.constants.get(namedExport.sourceName)
        const namedImport = module.namedImports.get(namedExport.sourceName)

        if (!record && namedImport) {
          const targetFilePath = resolveModulePath(
            module.filePath,
            namedImport.moduleSpecifier,
          )

          if (targetFilePath) {
            record = resolveExport(
              targetFilePath,
              namedImport.sourceName,
              resolving,
            )
          }
        }
      }
    }

    resolving.delete(resolutionKey)
    return record
  }

  /**
   * 读取指定模块命名导入最终对应的样式常量
   */
  return (filePath: string) => {
    const imported = new Map<string, RecordType>()
    const module = modules.get(normalizeFilePath(filePath))

    if (!module)
      return imported

    for (const namedImport of module.namedImports.values()) {
      const targetFilePath = resolveModulePath(
        module.filePath,
        namedImport.moduleSpecifier,
      )
      const record = targetFilePath
        ? resolveExport(targetFilePath, namedImport.sourceName, new Set())
        : undefined

      if (record)
        imported.set(namedImport.localName, record)
    }

    return imported
  }
}

/** -------------------- 内部函数 -------------------- */
/**
 * 将文件路径统一为模块图使用的 POSIX 路径
 */
function normalizeFilePath(filePath: string) {
  return path.posix.normalize(filePath.split(path.sep).join('/'))
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

function isArrayClassComposition(expression: ts.Expression) {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression))
    return false

  const methodName = expression.expression.name.text

  if (methodName === 'join') {
    const [separator] = expression.arguments

    return separator !== undefined
      && ts.isStringLiteral(separator)
      && separator.text === ' '
  }

  if (methodName !== 'filter')
    return false

  const [predicate] = expression.arguments
  return predicate !== undefined && ts.isIdentifier(predicate) && predicate.text === 'Boolean'
}
