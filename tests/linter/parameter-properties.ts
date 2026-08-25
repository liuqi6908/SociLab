import type { TypeScriptSource } from './source'
import path from 'node:path'
import * as ts from 'typescript'
import { unwrapExpression } from './ast'
import { comparePositionedDiagnostics, createVirtualTypeScriptPathHost, positionOf } from './source'

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

/** 已由 TypeScript Program 解析并绑定 TypeChecker 的源码 */
interface TypeCheckedSource extends TypeScriptSource {
  /** 共享类型检查器 */
  checker: ts.TypeChecker
  /** Program 中的源码节点 */
  sourceFile: ts.SourceFile
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')

/** -------------------- AST 检查函数 -------------------- */
/**
 * 读取变量声明直接使用的参数属性
 */
function readParameterPropertyDeclaration(
  declaration: ts.VariableDeclaration,
  parameters: ReadonlyMap<string, ts.ParameterDeclaration>,
  checker: ts.TypeChecker,
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

  if (!ts.isIdentifier(source))
    return

  const parameter = parameters.get(source.text)

  if (!parameter)
    return

  const declaredType = checker.getTypeAtLocation(parameter.name)
  const currentType = checker.getTypeAtLocation(source)

  // 已在 guard 后收窄的读取属于窄作用域，不参与函数入口声明顺序
  if (
    typeRequiresRuntimeNarrowing(declaredType, checker)
    && !typeRequiresRuntimeNarrowing(currentType, checker)
  ) {
    return
  }

  return {
    binding: declaration.name.text,
    node: declaration,
    parameter: source.text,
  }
}

/**
 * 判断类型是否仍可能包含需要运行时收窄的值
 */
function typeRequiresRuntimeNarrowing(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited = new Set<ts.Type>(),
): boolean {
  if (visited.has(type))
    return false

  visited.add(type)

  const unsafeFlags = ts.TypeFlags.Any
    | ts.TypeFlags.Null
    | ts.TypeFlags.Undefined
    | ts.TypeFlags.Unknown
    | ts.TypeFlags.Void

  if (type.flags & unsafeFlags)
    return true

  if (type.isUnion())
    return type.types.some(item => typeRequiresRuntimeNarrowing(item, checker, visited))

  if (type.isIntersection()) {
    return type.types.every(item => (
      typeRequiresRuntimeNarrowing(item, checker, visited)
    ))
  }

  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type)

    return constraint
      ? typeRequiresRuntimeNarrowing(constraint, checker, visited)
      : true
  }

  return false
}

/**
 * 判断变量声明是否仍属于连续的入口参数整理区
 */
function isParameterSetupDeclaration(
  declaration: ts.VariableDeclaration,
  parameterNames: ReadonlySet<string>,
) {
  if (!declaration.initializer)
    return false

  let current = unwrapExpression(declaration.initializer)

  while (
    ts.isPropertyAccessExpression(current)
    || ts.isElementAccessExpression(current)
  ) {
    current = unwrapExpression(current.expression)
  }

  return ts.isIdentifier(current) && parameterNames.has(current.text)
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
 * 读取函数的稳定诊断名称
 */
function readFunctionScope(node: ts.FunctionLikeDeclaration) {
  if (ts.isConstructorDeclaration(node))
    return 'constructor'

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
 * 使用 TypeScript 6 公共 Program 为受控源码建立语义模型
 */
function parseTypeCheckedSources(
  sources: readonly TypeScriptSource[],
  root = repositoryRoot,
): TypeCheckedSource[] {
  const virtualHost = createVirtualTypeScriptPathHost(sources, root)
  const { sourceByFileName } = virtualHost
  const fileNames = [...sourceByFileName.keys()]
  const configPath = ts.findConfigFile(root, ts.sys.fileExists)
  const readConfig = configPath
    ? ts.readConfigFile(configPath, ts.sys.readFile)
    : undefined

  if (readConfig?.error) {
    throw new Error(ts.flattenDiagnosticMessageText(
      readConfig.error.messageText,
      '\n',
    ))
  }

  const compilerOptions = configPath
    ? ts.parseJsonConfigFileContent(
      readConfig?.config ?? {},
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    ).options
    : {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        strict: true,
        target: ts.ScriptTarget.ESNext,
      }
  const host = ts.createCompilerHost(compilerOptions, true)
  const readSourceFile = host.getSourceFile.bind(host)

  host.directoryExists = virtualHost.directoryExists
  host.fileExists = virtualHost.fileExists
  host.getDirectories = virtualHost.getDirectories
  host.readFile = virtualHost.readFile
  host.getSourceFile = (
    fileName,
    languageVersionOrOptions,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const source = virtualHost.readFile(fileName)

    if (!sourceByFileName.has(path.resolve(fileName))) {
      return readSourceFile(
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile,
      )
    }

    return ts.createSourceFile(
      fileName,
      source,
      languageVersionOrOptions,
      true,
      fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
  }

  const program = ts.createProgram({
    host,
    options: compilerOptions,
    rootNames: fileNames,
  })
  const checker = program.getTypeChecker()

  return sources.map((item) => {
    const sourceFile = program.getSourceFile(path.resolve(root, item.filePath))

    if (!sourceFile)
      throw new Error(`TypeScript 无法解析源码：${item.filePath}`)

    return { ...item, checker, sourceFile }
  })
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

  for (const { checker, filePath, sourceFile } of parseTypeCheckedSources(sources)) {
    /** 检查单个函数体的首部参数属性声明区 */
    const inspect = (node: ts.FunctionLikeDeclaration) => {
      if (!node.body || !ts.isBlock(node.body))
        return

      const parameters = new Map(node.parameters.flatMap(parameter => (
        ts.isIdentifier(parameter.name)
          ? [[parameter.name.text, parameter] as const]
          : []
      )))
      const parameterNames = new Set(parameters.keys())

      if (parameterNames.size === 0)
        return

      let leadingDeclarations = true

      for (const statement of node.body.statements) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            const property = readParameterPropertyDeclaration(
              declaration,
              parameters,
              checker,
            )

            if (property) {
              if (!leadingDeclarations) {
                diagnostics.push({
                  ...positionOf(sourceFile, property.node),
                  filePath,
                  message: `${property.binding} 来自参数 ${property.parameter}，必须在函数体开头声明`,
                  scope: readFunctionScope(node),
                })
              }

              continue
            }

            if (!isParameterSetupDeclaration(declaration, parameterNames))
              leadingDeclarations = false
          }

          continue
        }

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
