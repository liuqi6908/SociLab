import type { TypeScriptSource } from './source'
import path from 'node:path'
import { parseTypeScriptSources, readModuleSpecifier } from './source'

/** -------------------- 类型 -------------------- */
/** 测试文件规模与领域依赖诊断 */
export interface TestStructureDiagnostic {
  /** 诊断文件 */
  filePath: string
  /** 违规类型 */
  kind:
    | 'cross-domain-import'
    | 'file-too-large'
    | 'missing-domain-directory'
    | 'outside-tests'
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
      if (!filePath.startsWith('tests/'))
        diagnostics.push({ filePath, kind: 'outside-tests' })
      else if (/^tests\/[^/]+$/.test(filePath))
        diagnostics.push({ filePath, kind: 'missing-domain-directory' })

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

/**
 * 将测试目录结构诊断格式化为守卫失败信息
 */
export function formatTestStructureDiagnostics(
  diagnostics: readonly TestStructureDiagnostic[],
) {
  return [
    '测试目录结构检查失败：',
    ...diagnostics.map(item => `- ${item.filePath}: ${describeTestStructureDiagnostic(item)}`),
  ].join('\n')
}

/**
 * 断言测试文件均符合规模与领域依赖约束
 */
export function assertTestStructure(sources: readonly TypeScriptSource[]) {
  const diagnostics = readTestStructureDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatTestStructureDiagnostics(diagnostics))
}

/** -------------------- 内部函数 -------------------- */
/**
 * 将结构诊断转换成稳定文案
 */
function describeTestStructureDiagnostic(diagnostic: TestStructureDiagnostic) {
  if (diagnostic.kind === 'cross-domain-import')
    return `领域测试不得相对导入 tests/${diagnostic.targetDomain}，跨领域共享能力应归入 tests/support`

  if (diagnostic.kind === 'missing-domain-directory')
    return '测试文件必须归入 tests 下的领域目录'

  if (diagnostic.kind === 'outside-tests')
    return '测试文件必须统一放入 tests 下的领域目录'

  return `测试文件共 ${diagnostic.lineCount} 行，超过 ${MAX_TEST_FILE_LINES} 行上限`
}
