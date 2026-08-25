import type { TypeScriptSource } from './source'
import path from 'node:path'
import {
  isProjectModuleCollection,
  isTanStackRoutesDirectory,
} from './source'

/** -------------------- 类型 -------------------- */
/** 模块目录职责布局诊断 */
export interface ModuleDirectoryLayoutDiagnostic {
  /** 唯一子目录包含的源码文件数 */
  childFileCount: number
  /** 唯一子目录 */
  childPath: string
  /** 当前聚合目录 */
  directoryPath: string
  /** 推荐的目录调整方式 */
  kind: 'flatten' | 'split'
}

/** -------------------- 核心函数 -------------------- */
/**
 * 检查源码聚合目录是否形成真实的并列模块
 */
export function readModuleDirectoryLayoutDiagnostics(
  sources: readonly TypeScriptSource[],
) {
  const filePaths = sources.map(source => source.filePath)
  const indexDirectories = new Set(
    filePaths
      .filter(filePath => /^index\.tsx?$/.test(path.posix.basename(filePath)))
      .map(filePath => path.posix.dirname(filePath)),
  )
  const diagnostics: ModuleDirectoryLayoutDiagnostic[] = []

  for (const directoryPath of indexDirectories) {
    if (
      isTanStackRoutesDirectory(directoryPath)
      || isProjectModuleCollection(directoryPath)
    ) {
      continue
    }

    const prefix = `${directoryPath}/`
    const childNames = new Set<string>()

    for (const filePath of filePaths) {
      if (!filePath.startsWith(prefix))
        continue

      const relativePath = filePath.slice(prefix.length)
      const separatorIndex = relativePath.indexOf('/')

      if (separatorIndex > 0)
        childNames.add(relativePath.slice(0, separatorIndex))
    }

    if (childNames.size !== 1)
      continue

    const [childName] = childNames

    if (!childName)
      continue

    const childPath = `${directoryPath}/${childName}`
    const childPrefix = `${childPath}/`
    const childFileCount = filePaths.filter(filePath => (
      filePath.startsWith(childPrefix)
    )).length

    diagnostics.push({
      childFileCount,
      childPath,
      directoryPath,
      kind: childFileCount === 1 ? 'flatten' : 'split',
    })
  }

  return diagnostics.sort((left, right) => (
    left.directoryPath.localeCompare(right.directoryPath)
  ))
}

/**
 * 将模块目录诊断格式化为测试失败信息
 */
export function formatModuleDirectoryLayoutDiagnostics(
  diagnostics: readonly ModuleDirectoryLayoutDiagnostic[],
) {
  return [
    '模块目录检查失败：',
    ...diagnostics.map(item => item.kind === 'flatten'
      ? `- ${item.childPath}: 仅含一个源码文件，应拍平到 ${item.directoryPath}`
      : `- ${item.directoryPath}: index 只挂载 ${item.childPath} 一个子目录，但该目录含 ${item.childFileCount} 个源码文件；应把当前层实现拆成第二个并列模块`),
  ].join('\n')
}

/**
 * 断言源码聚合目录均具有真实边界
 */
export function assertModuleDirectoryLayout(
  sources: readonly TypeScriptSource[],
) {
  const diagnostics = readModuleDirectoryLayoutDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatModuleDirectoryLayoutDiagnostics(diagnostics))
}
