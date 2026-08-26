import type { Checker, Type } from '@typescript/native/unstable/async'
import type { TypeScriptSource } from './source'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import { API, TypeFlags } from '@typescript/native/unstable/async'
import { createVirtualFileSystem } from '@typescript/native/unstable/fs'
import { isImplementedFunction, unwrapExpression } from './ast'
import { comparePositionedDiagnostics, positionOf, repositoryRoot } from './source'

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
async function readParameterPropertyDeclaration(
  declaration: ts.VariableDeclaration,
  parameters: ReadonlyMap<string, ts.ParameterDeclaration>,
  checker: Checker,
): Promise<ParameterPropertyDeclaration | undefined> {
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

  const declaredType = await checker.getTypeAtLocation(parameter.name)
  const currentType = await checker.getTypeAtLocation(source)

  // 已在 guard 后收窄的读取属于窄作用域，不参与函数入口声明顺序
  if (
    await typeRequiresRuntimeNarrowing(declaredType, checker)
    && !await typeRequiresRuntimeNarrowing(currentType, checker)
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
async function typeRequiresRuntimeNarrowing(
  type: Type | undefined,
  checker: Checker,
  visited = new Set<number>(),
): Promise<boolean> {
  if (!type)
    return true

  if (visited.has(type.id))
    return false

  visited.add(type.id)

  const unsafeFlags = TypeFlags.Any
    | TypeFlags.Null
    | TypeFlags.Undefined
    | TypeFlags.Unknown
    | TypeFlags.Void

  if (type.flags & unsafeFlags)
    return true

  if (type.isUnionType()) {
    const types = await type.getTypes() ?? []

    for (const item of types) {
      if (await typeRequiresRuntimeNarrowing(item, checker, visited))
        return true
    }

    return false
  }

  if (type.isIntersectionType()) {
    const types = await type.getTypes() ?? []

    for (const item of types) {
      if (!await typeRequiresRuntimeNarrowing(item, checker, visited))
        return false
    }

    return true
  }

  if (type.isTypeParameter()) {
    const constraint = await checker.getBaseConstraintOfType(type)

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

/** -------------------- 核心函数 -------------------- */
/**
 * 检查源码中的参数属性局部声明是否集中在函数体开头
 */
export async function readParameterPropertyOrderDiagnostics(
  sources: readonly TypeScriptSource[],
  root = repositoryRoot,
) {
  const diagnostics: ParameterPropertyOrderDiagnostic[] = []
  const sourceByFileName = new Map(sources.map(item => [
    path.resolve(root, item.filePath),
    item,
  ]))
  const fileNames = [...sourceByFileName.keys()]
  const api = new API({
    cwd: root,
    fs: createVirtualFileSystem(Object.fromEntries(
      [...sourceByFileName].map(([fileName, item]) => [fileName, item.source]),
    )),
  })
  let snapshot: Awaited<ReturnType<API['updateSnapshot']>> | undefined

  try {
    const configPath = path.resolve(root, 'tsconfig.json')

    snapshot = await api.updateSnapshot({
      openFiles: fileNames,
      openProjects: [configPath],
    })

    const configuredProject = snapshot.getProject(configPath)

    for (const fileName of fileNames) {
      const configuredSourceFile = await configuredProject?.program.getSourceFile(fileName)
      const project = configuredSourceFile
        ? configuredProject
        : await snapshot.getDefaultProjectForFile(fileName)
      const sourceFile = configuredSourceFile
        ?? await project?.program.getSourceFile(fileName)

      if (!sourceFile || !project)
        continue

      const checker = project.checker
      const filePath = sourceByFileName.get(fileName)?.filePath
        ?? path.relative(root, fileName).split(path.sep).join('/')
      const functions: ts.FunctionLikeDeclaration[] = []

      /** 检查单个函数体的首部参数属性声明区 */
      const inspect = async (node: ts.FunctionLikeDeclaration) => {
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
              const property = await readParameterPropertyDeclaration(
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

      /** 收集全部具有实现体的函数 */
      const visit = (node: ts.Node) => {
        if (isImplementedFunction(node))
          functions.push(node)

        node.forEachChild(visit)
      }

      visit(sourceFile)

      for (const node of functions)
        await inspect(node)
    }
  }
  finally {
    if (snapshot)
      await snapshot.dispose()
    await api.close()
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
export async function assertParameterPropertyOrder(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = await readParameterPropertyOrderDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatParameterPropertyOrderDiagnostics(diagnostics))
}
