/**
 * 比照 qygent@9da43edf 的 tests/linter/transformed-property-shorthand.ts
 * 原实现以 TypeScript AST 汇总多类项目命名建议并通过 console.warn 报告
 * SociLab 保留同名转换、别名返回与小型对象投影建议，不复制 SDK、Store 或组件命名假设
 * 本检查无响应式、回调更新或 SSR 状态，报告回调可注入且诊断本身不会触发硬失败
 */
// cspell:ignore qygent
import type { TypeScriptSource } from './source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'
import { isImplementedFunction, unwrapExpression } from './ast'
import {
  repositoryIgnoredDirNames,
  repositoryIgnoredFileNames,
} from './repository-paths'
import {
  comparePositionedDiagnostics,
  parseTypeScriptSources,
  positionOf,
} from './source'

/** -------------------- 类型 -------------------- */
/** 对象字段内联转换诊断 */
export interface TransformedPropertyShorthandDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** 诊断信息 */
  message: string
  /** 对象字段名称 */
  property: string
}

/** -------------------- 常量 -------------------- */
/** 调用参数对象进入建议范围的最大字段数 */
const maxCallArgumentProperties = 6
/** 建议开发者评估提前命名的最大派生字段数 */
const maxInlineProjections = 4
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')

/** -------------------- 核心函数 -------------------- */
/**
 * 读取对象字段转换建议的仓库源码
 */
export function readTransformedPropertyShorthandSources() {
  const sources: TypeScriptSource[] = []
  /** 收集指定源码目录 */
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

      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || repositoryIgnoredFileNames.has(entry.name))
        continue

      const filePath = path.relative(repositoryRoot, absolutePath)
        .split(path.sep)
        .join('/')

      if (filePath.includes('/src/') && !filePath.endsWith('.d.ts')) {
        sources.push({ filePath, source: readFileSync(absolutePath, 'utf8') })
      }
    }
  }

  collect(path.resolve(repositoryRoot, 'packages'))
  collect(path.resolve(repositoryRoot, 'projects'))
  return sources.sort((left, right) => left.filePath.localeCompare(right.filePath))
}

/**
 * 检查对象字段是否内联转换同名来源
 */
export function readTransformedPropertyShorthandDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TransformedPropertyShorthandDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    /** 检查单个对象字段是否内联转换同名解构来源 */
    const inspect = (node: ts.PropertyAssignment) => {
      const property = readPropertyName(node.name)
      const initializer = unwrapExpression(node.initializer)
      const transformedSource = property
        && ts.isCallExpression(initializer)
        && initializer.arguments.some((argument) => {
          const source = unwrapExpression(argument)

          return ts.isIdentifier(source) && source.text === property
        })
      const alias = ts.isIdentifier(initializer) && initializer.text !== property
        ? initializer.text
        : undefined
      const object = ts.isObjectLiteralExpression(node.parent)
        ? node.parent
        : undefined
      const renamedReturn = property
        && alias
        && object
        && ts.isReturnStatement(object.parent)
        && hasDestructuredBinding(
          readLexicalScope(node),
          property,
          node.getStart(sourceFile),
        )
      const mixedProperties = object
        ? readMixedProjectionProperties(object)
        : []
      const mixedProjection = mixedProperties[0] === node

      if (!property || (!transformedSource && !renamedReturn && !mixedProjection))
        return

      if (transformedSource) {
        const scope = readLexicalScope(node)

        if (!hasDestructuredBinding(
          scope,
          property,
          node.getStart(sourceFile),
        )) {
          return
        }
      }

      const mixedPropertyNames = mixedProperties
        .map(item => readPropertyName(item.name))
        .join('、')
      const mixedContext = object && readProjectionContext(object)
      const message = transformedSource
        ? `${property} 内联转换了同名来源；该建议非强制，请结合具体语义判断`
        : renamedReturn
          ? [
              `${property} 返回字段映射了 ${alias}，且同一作用域已有 ${property}`,
              `；可将前序临时绑定命名为 _${property}，让最终值使用属性简写`,
              '；该建议非强制，请结合具体语义判断',
            ].join('')
          : mixedContext === 'call'
            ? [
                `${mixedPropertyNames} 在调用参数对象中内联读取或派生`,
                '；若拆分能提升可读性，可考虑将 1–4 个关键派生值提前命名',
                '；该建议非强制，请结合具体语义判断',
              ].join('')
            : [
                `${mixedPropertyNames} 在返回对象中内联读取或派生`,
                '；若拆分能提升可读性，可考虑提前命名',
                '；该建议非强制，请结合具体语义判断',
              ].join('')

      diagnostics.push({
        ...positionOf(sourceFile, node),
        filePath,
        message,
        property,
      })
    }

    /** 遍历全部对象字段 */
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node))
        inspect(node)

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 格式化对象字段转换建议
 */
export function formatTransformedPropertyShorthandDiagnostics(
  diagnostics: readonly TransformedPropertyShorthandDiagnostic[],
) {
  return [
    '对象字段转换写法建议（非强制，请结合具体语义判断）：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.message}`
    )),
  ].join('\n')
}

/**
 * 以非强制 warning 报告对象字段转换建议
 */
export function warnTransformedPropertyShorthand(
  sources: readonly TypeScriptSource[],
  warn: (message: string) => void = console.warn,
) {
  const diagnostics = readTransformedPropertyShorthandDiagnostics(sources)

  if (diagnostics.length > 0)
    warn(formatTransformedPropertyShorthandDiagnostics(diagnostics))

  return diagnostics
}

/** -------------------- 内部函数 -------------------- */
/**
 * 读取对象字段的静态名称
 */
function readPropertyName(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text
}

/**
 * 读取直接提供同名对象字段的源对象
 */
function readDirectProjectionSource(node: ts.PropertyAssignment) {
  const property = readPropertyName(node.name)
  const initializer = unwrapExpression(node.initializer)

  if (
    !property
    || !ts.isPropertyAccessExpression(initializer)
    || initializer.name.text !== property
  ) {
    return
  }

  const source = unwrapExpression(initializer.expression)

  if (ts.isIdentifier(source))
    return source.text
}

/**
 * 判断字段值是否包含适合提前命名的读取或派生表达式
 */
function isInlineProjection(initializer: ts.Expression) {
  const value = unwrapExpression(initializer)

  return ts.isPropertyAccessExpression(value)
    || ts.isElementAccessExpression(value)
    || ts.isCallExpression(value)
    || ts.isBinaryExpression(value)
    || ts.isConditionalExpression(value)
    || ts.isAwaitExpression(value)
}

/**
 * 读取对象作为返回值或直接调用参数时的使用位置
 */
function readProjectionContext(node: ts.ObjectLiteralExpression) {
  if (ts.isReturnStatement(node.parent))
    return 'return' as const

  if (
    ts.isCallExpression(node.parent)
    && node.parent.arguments.some(argument => unwrapExpression(argument) === node)
  ) {
    return 'call' as const
  }
}

/**
 * 读取小型对象中混合的直接字段投影与内联派生
 */
function readMixedProjectionProperties(node: ts.ObjectLiteralExpression) {
  const context = readProjectionContext(node)

  if (!context)
    return []

  const shorthandCount = node.properties.filter(
    ts.isShorthandPropertyAssignment,
  ).length
  const assignments = node.properties.filter(ts.isPropertyAssignment)
  const projections = assignments.filter(
    assignment => isInlineProjection(assignment.initializer),
  )
  const sourceCounts = new Map<string, number>()
  let derived = false

  for (const assignment of assignments) {
    const source = readDirectProjectionSource(assignment)

    if (source) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    }
    else if (isInlineProjection(assignment.initializer)) {
      derived = true
    }
  }

  if (context === 'call') {
    const conciseObject = node.properties.length <= maxCallArgumentProperties
    const fewProjections = projections.length > 0
      && projections.length <= maxInlineProjections

    if (!derived || shorthandCount < 2 || !conciseObject || !fewProjections)
      return []

    return projections
  }

  const repeatedSource = [...sourceCounts.values()].some(count => count >= 2)
  const conciseProjection = shorthandCount >= 2 || node.properties.length <= 6

  if (!derived || !repeatedSource || !conciseProjection)
    return []

  return projections
}

/**
 * 读取对象字段所在的最近词法作用域
 */
function readLexicalScope(node: ts.Node) {
  let current: ts.Node = node

  while (!ts.isSourceFile(current) && !isImplementedFunction(current))
    current = current.parent

  return current
}

/**
 * 判断同名来源是否由当前作用域前方的对象解构引入
 */
function hasDestructuredBinding(
  scope: ts.FunctionLikeDeclaration | ts.SourceFile,
  name: string,
  before: number,
) {
  let matched = false

  /** 只检查当前作用域，嵌套函数拥有独立绑定来源 */
  const visit = (node: ts.Node) => {
    if (
      matched
      || node.getStart(scope.getSourceFile()) >= before
      || (node !== scope && isImplementedFunction(node))
    ) {
      return
    }

    if (
      ts.isBindingElement(node)
      && ts.isObjectBindingPattern(node.parent)
      && ts.isIdentifier(node.name)
      && node.name.text === name
    ) {
      matched = true
      return
    }

    node.forEachChild(visit)
  }

  visit(scope)
  return matched
}
