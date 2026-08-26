import type { TypeScriptSource } from './source'
import path from 'node:path'
import { API } from '@typescript/native/unstable/async'
import { createVirtualFileSystem } from '@typescript/native/unstable/fs'
import { repositoryRoot } from './source'

/** -------------------- 类型 -------------------- */
/** 废弃 API 使用诊断 */
export interface DeprecatedApiDiagnostic {
  /** TypeScript 诊断码 */
  code: number
  /** 诊断列号 */
  column: number
  /** 诊断文件 */
  filePath: string
  /** 诊断行号 */
  line: number
  /** TypeScript 诊断信息 */
  message: string
}

/** -------------------- 核心函数 -------------------- */
/**
 * 通过 TypeScript Language Service 检查源码中的废弃 API 使用
 */
export async function readDeprecatedApiDiagnostics(
  sources: readonly TypeScriptSource[],
  root = repositoryRoot,
) {
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
  const diagnostics: DeprecatedApiDiagnostic[] = []
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

      for (const diagnostic of await project.program.getSuggestionDiagnostics(fileName)) {
        // reportsDeprecated 是 LSP 的稳定语义标记，不能绑定具体诊断码
        if (!diagnostic.reportsDeprecated)
          continue

        const { character, line } = sourceFile.getLineAndCharacterOfPosition(
          diagnostic.pos,
        )

        diagnostics.push({
          code: diagnostic.code,
          column: character + 1,
          filePath: sourceByFileName.get(fileName)?.filePath
            ?? path.relative(root, fileName).split(path.sep).join('/'),
          line: line + 1,
          message: diagnostic.text,
        })
      }
    }
  }
  finally {
    if (snapshot)
      await snapshot.dispose()
    await api.close()
  }

  return diagnostics.sort((left, right) => (
    left.filePath.localeCompare(right.filePath)
    || left.line - right.line
    || left.column - right.column
  ))
}

/**
 * 将废弃 API 诊断格式化为测试失败信息
 */
export function formatDeprecatedApiDiagnostics(
  diagnostics: readonly DeprecatedApiDiagnostic[],
) {
  return [
    '废弃 API 检查失败：',
    ...diagnostics.map(item => (
      `- ${item.filePath}:${item.line}:${item.column} TS${item.code}: ${item.message}`
    )),
  ].join('\n')
}

/**
 * 断言一组源码未使用 TypeScript 标记的废弃 API
 */
export async function assertNoDeprecatedApis(sources: readonly TypeScriptSource[]) {
  const diagnostics = await readDeprecatedApiDiagnostics(sources)

  if (diagnostics.length > 0)
    throw new Error(formatDeprecatedApiDiagnostics(diagnostics))
}
