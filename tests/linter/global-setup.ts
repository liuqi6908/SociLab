import type { TypeScriptSource } from './source'
import { readRepositoryGuardInputs, runCachedRepositoryGuards } from './cache'
import { assertClassNameComposition } from './class-name-composition'
import { assertCustomHookModules } from './custom-hook-modules'
import { assertNoDeprecatedApis } from './deprecated-api'
import { assertExplicitExports } from './explicit-exports'
import { assertInterfaceComments } from './interface-comments'
import { assertJsxReturnLayout } from './jsx-return-layout'
import { assertModuleDirectoryLayout } from './module-directory-layout'
import { assertNamedImportExportLayout } from './named-import-export-layout'
import { assertParameterPropertyOrder } from './parameter-properties'
import { assertPrivateMemberNaming } from './private-members'
import { assertReactComponentDeclarations } from './react-component-declarations'
import { assertReactHookOrder } from './react-hooks'
import { scanRepositoryResiduals } from './residual-scan'
import { readTypeScriptSources } from './source'
import { assertTailwindCanonicalClasses, assertTailwindCssConflicts } from './tailwind-canonical'
import { assertTestStructure } from './test-structure'
import { warnTransformedPropertyShorthand } from './transformed-property-shorthand'

/** -------------------- 类型 -------------------- */
/** Vitest global setup 读取仓库根目录所需的最小项目上下文 */
interface RepositoryGuardProject {
  /** Vitest 项目配置 */
  config: {
    /** 当前项目根目录 */
    root: string
  }
}

/** 全仓守卫及其稳定诊断名称 */
interface RepositoryGuard {
  /** 守卫名称 */
  name: string
  /** 守卫实现 */
  run: () => unknown | Promise<unknown>
}

/** -------------------- 核心函数 -------------------- */
/**
 * 执行当前仓库的质量与残留守卫
 */
export async function runRepositoryGuards(root: string) {
  const inputs = readRepositoryGuardInputs(root)

  await runCachedRepositoryGuards(inputs, async () => {
    const sources = readTypeScriptSources(undefined, root)
    const productionSources = sources.filter(isProductionSource)
    const reactComponentSources = productionSources.filter(item => (
      item.filePath.endsWith('.tsx')
    ))
    const reactSources = productionSources.filter(item => (
      item.filePath.startsWith('packages/shared-ui/src/')
      || item.filePath.startsWith('projects/admin/src/')
      || item.filePath.startsWith('projects/client/src/')
    ))
    const guards: RepositoryGuard[] = [
      { name: 'module-directory-layout', run: () => assertModuleDirectoryLayout(productionSources) },
      { name: 'deprecated-api', run: () => assertNoDeprecatedApis(productionSources) },
      { name: 'class-name-composition', run: () => assertClassNameComposition(productionSources) },
      { name: 'custom-hook-modules', run: () => assertCustomHookModules(reactSources) },
      { name: 'explicit-exports', run: () => assertExplicitExports(productionSources) },
      { name: 'interface-comments', run: () => assertInterfaceComments(productionSources) },
      { name: 'jsx-return-layout', run: () => assertJsxReturnLayout(reactComponentSources) },
      { name: 'named-import-export-layout', run: () => assertNamedImportExportLayout(sources) },
      { name: 'parameter-properties', run: () => assertParameterPropertyOrder(productionSources) },
      { name: 'private-members', run: () => assertPrivateMemberNaming(productionSources) },
      { name: 'react-component-declarations', run: () => assertReactComponentDeclarations(reactComponentSources) },
      { name: 'react-hooks', run: () => assertReactHookOrder(reactSources) },
      { name: 'tailwind-canonical', run: () => assertTailwindCanonicalClasses(productionSources) },
      { name: 'tailwind-conflicts', run: () => assertTailwindCssConflicts(productionSources) },
      { name: 'test-structure', run: () => assertTestStructure(sources) },
      { name: 'transformed-property-shorthand', run: () => warnTransformedPropertyShorthand(productionSources) },
      { name: 'residual-scan', run: () => assertNoRepositoryResiduals(root) },
    ]
    const results = await Promise.allSettled(guards.map(guard => (
      Promise.resolve().then(() => guard.run())
    )))
    const diagnostics = results.flatMap((result, index) => (
      result.status === 'rejected'
        ? [`${guards[index]!.name}: ${readErrorMessage(result.reason)}`]
        : []
    ))

    if (diagnostics.length > 0) {
      throw new Error([
        '全仓质量守卫检查失败',
        ...diagnostics.map(item => `- ${item}`),
      ].join('\n'))
    }
  }, root)
}

/**
 * 每轮 Vitest 运行执行一次全仓守卫
 */
export default async function setupRepositoryGuards(
  project: RepositoryGuardProject,
) {
  await runRepositoryGuards(project.config.root)
}

/** -------------------- 内部函数 -------------------- */
/** 判断源码是否属于需要统一质量检查的生产模块 */
function isProductionSource(source: TypeScriptSource) {
  return (
    source.filePath.startsWith('packages/')
    || source.filePath.startsWith('projects/')
  )
  && source.filePath.includes('/src/')
  && !source.filePath.endsWith('.d.ts')
}

/** 断言仓库中不存在 qygent 领域与品牌残留 */
function assertNoRepositoryResiduals(root: string) {
  const diagnostics = scanRepositoryResiduals(root)

  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(item => (
      `${item.kind} ${item.filePath}: ${item.value}`
    )).join('\n'))
  }
}

/** 将未知异常收窄为稳定诊断文本 */
function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
