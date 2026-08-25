import {
  readRepositoryGuardInputs,
  runCachedRepositoryGuards,
} from './cache'
import { scanRepositoryQuality } from './quality-guards'
import { scanRepositoryResiduals } from './residual-scan'

/** -------------------- 类型 -------------------- */
/** Vitest global setup 读取仓库根目录所需的最小项目上下文 */
interface RepositoryGuardProject {
  /** Vitest 项目配置 */
  config: {
    /** 当前项目根目录 */
    root: string
  }
}

/** -------------------- 核心函数 -------------------- */
/**
 * 执行当前仓库的质量与残留守卫
 */
export async function runRepositoryGuards(root: string) {
  const inputs = readRepositoryGuardInputs(root)

  await runCachedRepositoryGuards(inputs, () => {
    const qualityDiagnostics = scanRepositoryQuality(root)
    const residualDiagnostics = scanRepositoryResiduals(root)
    const diagnostics = [
      ...qualityDiagnostics.map(item => (
        `质量 ${item.rule} ${item.filePath}: ${item.message}`
      )),
      ...residualDiagnostics.map(item => (
        `残留 ${item.kind} ${item.filePath}: ${item.value}`
      )),
    ]

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
