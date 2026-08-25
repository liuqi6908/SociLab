/**
 * 源实现来自内部参考仓库 9da43edf 的 tests/linter/jsx-return-layout.ts
 * 原实现遍历 TypeScript AST，本项目改用 TypeScript 6 公共 AST 与既有解析边界
 * 本守卫不涉及响应式依赖、回调更新或 SSR/浏览器生命周期，失败统一返回布局诊断
 */
import type { TypeScriptSource } from './source'
import * as ts from 'typescript'
import { parseTypeScriptSources, positionOf } from './source'

/** -------------------- 类型 -------------------- */
/** JSX return 布局诊断 */
export interface JsxReturnLayoutDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** 折叠后的单行字符数 */
  singleLineLength: number
}

/** -------------------- 常量 -------------------- */
/** JSX return 保持单行的字符数上限 */
export const MAX_SINGLE_LINE_JSX_RETURN_LENGTH = 120

/** -------------------- 核心函数 -------------------- */
/**
 * 检查可在一行内表达的 JSX return 是否存在多余括号换行
 */
export function readJsxReturnLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: JsxReturnLayoutDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    if (!filePath.endsWith('.tsx'))
      continue

    /** 收集被多行括号包裹但 JSX 本身可保持单行的 return */
    const visit = (node: ts.Node) => {
      if (
        ts.isReturnStatement(node)
        && node.expression
        && ts.isParenthesizedExpression(node.expression)
      ) {
        const expression = node.expression.expression
        const jsx = ts.isJsxElement(expression)
          || ts.isJsxSelfClosingElement(expression)
          ? expression
          : undefined

        if (jsx) {
          const jsxText = jsx.getText(sourceFile)
          const returnText = node.getText(sourceFile)
          const position = positionOf(sourceFile, node)
          const singleLineLength = position.column - 1 + `return ${jsxText}`.length

          if (
            returnText.includes('\n')
            && !jsxText.includes('\n')
            && singleLineLength <= MAX_SINGLE_LINE_JSX_RETURN_LENGTH
          ) {
            diagnostics.push({
              ...position,
              filePath,
              singleLineLength,
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

/**
 * 断言短 JSX return 没有多余括号换行
 */
export function assertJsxReturnLayout(sources: readonly TypeScriptSource[]) {
  const diagnostics = readJsxReturnLayoutDiagnostics(sources)

  if (diagnostics.length === 0)
    return

  const message = diagnostics.map(item => (
    `${item.filePath}:${item.line}:${item.column} JSX return 单行仅 ${item.singleLineLength} 字符，应写在一行内`
  )).join('\n')

  throw new Error(`JSX return 布局检查失败：\n${message}`)
}
