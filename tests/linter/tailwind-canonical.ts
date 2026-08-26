import type { TypeScriptSource } from './source'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ts from '@typescript/native/unstable/ast'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import { parseTypeScriptSources, repositoryIgnoredDirNames, repositoryIgnoredFileNames } from './source'

/** -------------------- 类型 -------------------- */
/** Tailwind canonical utility 诊断 */
export interface TailwindCanonicalDiagnostic {
  /** 非 canonical utility */
  className: string
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** canonical utility 建议 */
  suggestion: string
}

/** Tailwind CSS 属性冲突诊断 */
export interface TailwindCssConflictDiagnostic {
  /** 冲突 utility */
  className: string
  /** 同一静态 class 列表中的冲突 utility */
  conflictingClassNames: string[]
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
}

/** Tailwind 编译结果中当前检查所需的最小 AST 节点 */
interface TailwindAstNode {
  /** AST 节点类型 */
  kind: string
  /** at-rule 名称 */
  name?: string
  /** 子节点 */
  nodes?: TailwindAstNode[]
  /** at-rule 参数 */
  params?: string
  /** CSS 属性名 */
  property?: string
  /** rule 选择器 */
  selector?: string
}

/** Tailwind utility 编译后的属性与嵌套上下文 */
interface TailwindCompiledRule {
  /** 除 utility 外层规则外仍会影响声明范围的上下文 */
  context: string[]
  /** 当前规则直接声明的 CSS 属性 */
  properties: string[]
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
/** Tailwind 只扫描会消费共享主题的前端源码 */
const tailwindSourceRoots = [
  'projects/client/src',
  'projects/admin/src',
  'packages/shared-ui/src',
] as const
/** 唯一项目主题入口与 Tailwind 默认主题 */
const tailwindThemePaths = [
  'node_modules/tailwindcss/theme.css',
  'packages/shared-ui/src/styles.css',
] as const
/** Tailwind IntelliSense 默认浏览器根字号 */
const tailwindRootFontSize = 16
/** 同一轮测试复用的 Tailwind Design System */
let tailwindDesignSystem: ReturnType<typeof createTailwindDesignSystem> | undefined

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 Tailwind 前端源码
 */
export function readTailwindSources(): TypeScriptSource[] {
  return readRepositoryTypeScriptSources(tailwindSourceRoots)
}

/**
 * 检查非 canonical Tailwind utility
 */
export async function readTailwindCanonicalDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TailwindCanonicalDiagnostic[] = []
  const designSystem = await loadTailwindDesignSystem()

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    /** 通过真实 Design System 生成 canonical utility */
    const canonical = (className: string) => {
      const [suggestion] = designSystem.canonicalizeCandidates(
        [className],
        { rem: tailwindRootFontSize },
      )

      return suggestion && suggestion !== className ? suggestion : undefined
    }

    /** 收集字符串和无插值模板中的 utility 候选 */
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const match of node.text.matchAll(/\S+/g)) {
          const className = match[0]
          const suggestion = canonical(className)

          if (!suggestion)
            continue

          const position = node.getStart(sourceFile) + 1 + (match.index ?? 0)
          const { line } = sourceFile.getLineAndCharacterOfPosition(position)

          diagnostics.push({ className, filePath, line: line + 1, suggestion })
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(compareTailwindDiagnostics)
}

/**
 * 检查同一静态 class 列表中的 CSS 属性冲突
 */
export async function readTailwindCssConflictDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TailwindCssConflictDiagnostic[] = []
  const designSystem = await loadTailwindDesignSystem()

  for (const { filePath, sourceFile } of await parseTypeScriptSources(sources)) {
    /** 收集单个静态 class 列表中的 CSS 属性冲突 */
    const inspect = (
      node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
    ) => {
      const entries = [...node.text.matchAll(/\S+/g)].flatMap((match) => {
        const className = match[0]
        const [ast] = designSystem.candidatesToAst([className])

        if (!ast)
          return []

        const rules = readTailwindRules(ast as TailwindAstNode[])

        return rules.length > 0 ? [{ className, match, rules }] : []
      })

      for (const entry of entries) {
        const conflictingClassNames = entries
          .filter(other => (
            other !== entry && tailwindRulesEqual(other.rules, entry.rules)
          ))
          .map(other => other.className)

        if (conflictingClassNames.length === 0)
          continue

        const position = node.getStart(sourceFile) + 1 + (entry.match.index ?? 0)
        const { line } = sourceFile.getLineAndCharacterOfPosition(position)

        diagnostics.push({
          className: entry.className,
          conflictingClassNames,
          filePath,
          line: line + 1,
        })
      }
    }

    /** 遍历静态 class 列表 */
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        inspect(node)

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(compareTailwindDiagnostics)
}

/**
 * 格式化 Tailwind canonical 诊断
 */
export function formatTailwindCanonicalDiagnostics(
  diagnostics: readonly TailwindCanonicalDiagnostic[],
) {
  return ['Tailwind canonical 检查失败：', ...diagnostics.map(item => (
    `- ${item.filePath}:${item.line} ${item.className} 应改为 ${item.suggestion}`
  ))].join('\n')
}

/**
 * 格式化 Tailwind CSS 属性冲突诊断
 */
export function formatTailwindCssConflictDiagnostics(
  diagnostics: readonly TailwindCssConflictDiagnostic[],
) {
  return ['Tailwind CSS 属性冲突检查失败：', ...diagnostics.map(item => (
    `- ${item.filePath}:${item.line} ${item.className} 与 ${item.conflictingClassNames.join('、')} 冲突`
  ))].join('\n')
}

/**
 * 断言源码只使用 canonical Tailwind utility
 */
export async function assertTailwindCanonicalClasses(
  sources: readonly TypeScriptSource[],
) {
  const canonicalDiagnostics = await readTailwindCanonicalDiagnostics(sources)

  if (canonicalDiagnostics.length > 0)
    throw new Error(formatTailwindCanonicalDiagnostics(canonicalDiagnostics))
}

/**
 * 断言同一静态 class 列表中不存在 Tailwind CSS 属性冲突
 */
export async function assertTailwindCssConflicts(
  sources: readonly TypeScriptSource[],
) {
  const conflictDiagnostics = await readTailwindCssConflictDiagnostics(sources)

  if (conflictDiagnostics.length > 0)
    throw new Error(formatTailwindCssConflictDiagnostics(conflictDiagnostics))
}

/** -------------------- 内部函数 -------------------- */
/**
 * 枚举 Tailwind 守卫需要的仓库 TypeScript 源码
 */
function readRepositoryTypeScriptSources(
  sourceRoots: readonly string[],
  root = repositoryRoot,
) {
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

      sources.push({
        filePath: path.relative(root, absolutePath).split(path.sep).join('/'),
        source: readFileSync(absolutePath, 'utf8'),
      })
    }
  }

  for (const sourceRoot of sourceRoots)
    collect(path.resolve(root, sourceRoot))

  return sources.sort((left, right) => left.filePath.localeCompare(right.filePath))
}

/**
 * 创建包含默认主题和唯一共享主题入口的 Design System
 */
function createTailwindDesignSystem() {
  const css = tailwindThemePaths
    .map(filePath => readFileSync(path.resolve(repositoryRoot, filePath), 'utf8'))
    .map(source => source.replace(/^@import .*;$/gm, ''))
    .join('\n')

  return __unstable__loadDesignSystem(css)
}

/**
 * 延迟创建并复用 Tailwind Design System
 */
function loadTailwindDesignSystem() {
  tailwindDesignSystem ??= createTailwindDesignSystem()
  return tailwindDesignSystem
}

/**
 * 收集 utility 编译后的声明与嵌套上下文
 */
function readTailwindRules(
  nodes: TailwindAstNode[],
  parentNodes: TailwindAstNode[] = [],
) {
  const rules: TailwindCompiledRule[] = []

  for (const node of nodes) {
    const nodePath = [...parentNodes, node]

    if (node.kind === 'rule' || node.kind === 'at-rule') {
      const properties = (node.nodes ?? []).flatMap(child => (
        child.kind === 'declaration' && child.property ? [child.property] : []
      ))

      if (properties.length > 0) {
        const context = nodePath
          .map(printTailwindContext)
          .filter(Boolean)
          .slice(1)

        rules.push({ context, properties })
      }
    }

    if (node.nodes)
      rules.push(...readTailwindRules(node.nodes, nodePath))
  }

  return rules
}

/**
 * 将 Tailwind AST 规则转换为可比较的上下文
 */
function printTailwindContext(node: TailwindAstNode) {
  if (node.kind === 'rule')
    return node.selector ?? ''

  if (node.kind === 'at-rule')
    return [node.name, node.params].filter(Boolean).join(' ')

  return ''
}

/**
 * 判断两个 utility 是否生成相同数量、上下文与属性的规则
 */
function tailwindRulesEqual(
  left: readonly TailwindCompiledRule[],
  right: readonly TailwindCompiledRule[],
) {
  return left.length === right.length
    && left.length > 0
    && left.every((rule, index) => {
      const other = right[index]!

      return arraysEqual(rule.context, other.context)
        && arraysEqual(rule.properties, other.properties)
    })
}

/**
 * 判断两个有序字符串集合是否一致
 */
function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

/**
 * 按文件、行与 utility 稳定排列 Tailwind 诊断
 */
function compareTailwindDiagnostics(
  left: TailwindCanonicalDiagnostic | TailwindCssConflictDiagnostic,
  right: TailwindCanonicalDiagnostic | TailwindCssConflictDiagnostic,
) {
  return left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.className.localeCompare(right.className)
}
