import type { TypeScriptSource } from './source'
import * as ts from 'typescript'
import { unwrapExpression } from './ast'
import {
  comparePositionedDiagnostics,
  parseTypeScriptSources,
  positionOf,
} from './source'

/** -------------------- 类型 -------------------- */
/** 自定义 Hook 模块边界诊断 */
export interface CustomHookModuleDiagnostic {
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 自定义 Hook 名称 */
  hookName: string
  /** 诊断行号 */
  line: number
}

/** -------------------- 核心函数 -------------------- */
/**
 * 读取 JSX 组件模块中的自定义 Hook 实现诊断
 */
export function readCustomHookModuleDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: CustomHookModuleDiagnostic[] = []

  for (const { filePath, sourceFile } of parseTypeScriptSources(sources)) {
    if (!filePath.endsWith('.tsx'))
      continue

    /** 记录 TSX 中具有实际实现体的自定义 Hook */
    const report = (hookName: string, node: ts.Node) => {
      diagnostics.push({
        ...positionOf(sourceFile, node),
        filePath,
        hookName,
      })
    }
    /** 遍历顶层与嵌套声明 */
    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node)
        && node.body
        && node.name
        && /^use[A-Z0-9]/.test(node.name.text)
      ) {
        report(node.name.text, node.name)
      }
      else if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && /^use[A-Z0-9]/.test(node.name.text)
        && node.initializer
      ) {
        const initializer = unwrapExpression(node.initializer)

        if (
          ts.isArrowFunction(initializer)
          || ts.isFunctionExpression(initializer)
        ) {
          report(node.name.text, node.name)
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)
  }

  return diagnostics.sort(comparePositionedDiagnostics)
}

/**
 * 格式化自定义 Hook 模块边界诊断
 */
export function formatCustomHookModuleDiagnostics(
  diagnostics: readonly CustomHookModuleDiagnostic[],
) {
  return [
    '自定义 Hook 模块边界检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} ${item.hookName} 实现位于 JSX 组件模块，应拆到 hooks.ts、hooks/ 或其他非 JSX 模块`
    )),
  ].join('\n')
}

/**
 * 断言 JSX 组件模块中不存在自定义 Hook 实现
 */
export function assertNoCustomHookModules(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = readCustomHookModuleDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatCustomHookModuleDiagnostics(diagnostics))
}
