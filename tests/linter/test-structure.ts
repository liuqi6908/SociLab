import type { TypeScriptSource } from './quality-guard-source'
import path from 'node:path'
import {
  parseTypeScriptSources,
  readModuleSpecifier,
} from './quality-guard-source'

/** -------------------- 类型 -------------------- */
/** 测试文件规模与领域依赖诊断 */
export interface TestStructureDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind: 'cross-domain-import' | 'file-too-large'
  /** 超限测试文件行数 */
  lineCount?: number
  /** 被跨领域引用的测试目录 */
  targetDomain?: string
}

/** -------------------- 常量 -------------------- */
/** 单测试文件允许的最大行数 */
export const MAX_TEST_FILE_LINES = 2_000

/** -------------------- 核心函数 -------------------- */
/**
 * 检查测试文件规模与跨领域相对依赖
 */
export function readTestStructureDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics: TestStructureDiagnostic[] = []

  for (const { filePath, source, sourceFile } of parseTypeScriptSources(sources)) {
    if (/\.(?:spec|test)\.tsx?$/.test(filePath)) {
      const lines = source.split(/\r?\n/)
      const lineCount = lines.at(-1) === '' ? lines.length - 1 : lines.length

      if (lineCount > MAX_TEST_FILE_LINES)
        diagnostics.push({ filePath, kind: 'file-too-large', lineCount })
    }

    const pathParts = filePath.split('/')

    if (pathParts[0] !== 'tests' || pathParts.length < 3)
      continue

    const sourceDomain = pathParts[1]
    const targetDomains = new Set<string>()

    /** 收集跨领域相对导入目标 */
    const visit = (node: Parameters<typeof sourceFile.forEachChild>[0]) => {
      const moduleSpecifier = readModuleSpecifier(node)

      if (
        moduleSpecifier
        && moduleSpecifier.value.startsWith('.')
      ) {
        const targetPath = path.posix.normalize(path.posix.join(
          path.posix.dirname(filePath),
          moduleSpecifier.value,
        ))
        const [targetRoot, targetDomain] = targetPath.split('/')

        if (
          targetRoot === 'tests'
          && targetDomain
          && targetDomain !== sourceDomain
          && targetDomain !== 'support'
        ) {
          targetDomains.add(targetDomain)
        }
      }

      node.forEachChild(visit)
    }

    visit(sourceFile)

    for (const targetDomain of [...targetDomains].sort()) {
      diagnostics.push({
        filePath,
        kind: 'cross-domain-import',
        targetDomain,
      })
    }
  }

  return diagnostics.sort((left, right) => (
    left.filePath.localeCompare(right.filePath)
    || left.kind.localeCompare(right.kind)
  ))
}
