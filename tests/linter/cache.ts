import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  repositoryIgnoredDirNames,
  repositoryIgnoredFileNames,
} from './repository-paths'

/** -------------------- 类型 -------------------- */
/** 全仓守卫缓存输入 */
export interface RepositoryGuardInput {
  /** 仓库相对路径 */
  filePath: string
  /** 文件内容 */
  source: string
}

/** 全仓守卫成功缓存 */
interface RepositoryGuardCache {
  /** 全部受控输入的内容摘要 */
  digest: string
  /** 缓存格式版本 */
  version: number
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
/** 全仓守卫缓存格式版本 */
const repositoryGuardCacheVersion = 1
/** 需要递归枚举的守卫输入根目录 */
const repositoryGuardInputRoots = ['packages', 'projects', 'tests'] as const
/** 影响依赖解析、守卫配置与运行环境的根文件 */
const rootGuardInputNames = new Set([
  '.npmrc',
  '.nvmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
])

/** -------------------- 核心函数 -------------------- */
/**
 * 枚举影响全仓守卫结果的仓库输入
 */
export function readRepositoryGuardInputs(root = repositoryRoot) {
  const inputs: RepositoryGuardInput[] = []

  /** 读取单个文本输入 */
  const read = (absolutePath: string) => {
    inputs.push({
      filePath: toPosixPath(path.relative(root, absolutePath)),
      source: readFileSync(absolutePath, 'utf8'),
    })
  }
  /** 递归收集源码、样式、页面、Manifest 与局部工程配置 */
  const collect = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => (
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0
      ))

    for (const entry of entries) {
      if (entry.isDirectory() && repositoryIgnoredDirNames.has(entry.name))
        continue

      const absolutePath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const relativeDir = toPosixPath(path.relative(root, absolutePath))

        if (relativeDir === 'tests/linter/fixtures')
          continue

        collect(absolutePath)
        continue
      }

      if (
        entry.isFile()
        && !repositoryIgnoredFileNames.has(entry.name)
        && isNestedGuardInput(entry.name)
      ) {
        read(absolutePath)
      }
    }
  }

  for (const inputRoot of repositoryGuardInputRoots) {
    const absoluteRoot = path.join(root, inputRoot)

    try {
      collect(absoluteRoot)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && isRootGuardInput(entry.name))
      read(path.join(root, entry.name))
  }

  return inputs.sort((left, right) => (
    left.filePath < right.filePath ? -1 : left.filePath > right.filePath ? 1 : 0
  ))
}

/**
 * 在输入未变化时复用全仓守卫成功结果
 */
export async function runCachedRepositoryGuards(
  inputs: readonly RepositoryGuardInput[],
  run: () => void | Promise<void>,
  root = repositoryRoot,
) {
  const cacheDir = path.join(root, '.cache/tests/linter')
  const cachePath = path.join(cacheDir, 'guard.json')
  const digest = createRepositoryGuardDigest(inputs)

  try {
    const cache: unknown = JSON.parse(readFileSync(cachePath, 'utf8'))

    if (
      isRepositoryGuardCache(cache)
      && cache.version === repositoryGuardCacheVersion
      && cache.digest === digest
    ) {
      return
    }
  }
  catch {}

  await run()
  mkdirSync(cacheDir, { recursive: true })

  const temporaryPath = `${cachePath}.${process.pid}.tmp`

  try {
    writeFileSync(temporaryPath, JSON.stringify({
      digest,
      version: repositoryGuardCacheVersion,
    }))
    renameSync(temporaryPath, cachePath)
  }
  finally {
    rmSync(temporaryPath, { force: true })
  }
}

/** -------------------- 内部函数 -------------------- */
/**
 * 判断局部文件是否会影响质量或残留守卫
 */
function isNestedGuardInput(name: string) {
  return /\.[cm]?[jt]sx?$/.test(name)
    || /\.(?:css|html)$/.test(name)
    || /^\.env(?:\..+)?$/.test(name)
    || /^tsconfig(?:\.[^.]+)?\.json$/.test(name)
    || name === '.npmrc'
    || name === 'package.json'
}

/**
 * 判断根文件是否会影响守卫、模块解析或运行环境
 */
function isRootGuardInput(name: string) {
  return rootGuardInputNames.has(name)
    || /^\.env(?:\..+)?$/.test(name)
    || /^tsconfig(?:\.[^.]+)?\.json$/.test(name)
    || /\.config\.[cm]?[jt]s$/.test(name)
}

/**
 * 计算受控输入和运行环境共同决定的缓存摘要
 */
function createRepositoryGuardDigest(inputs: readonly RepositoryGuardInput[]) {
  const hash = createHash('sha256')

  hash.update(JSON.stringify({
    arch: process.arch,
    node: process.version,
    platform: process.platform,
    version: repositoryGuardCacheVersion,
  }))

  for (const { filePath, source } of inputs) {
    hash.update(filePath)
    hash.update('\0')
    hash.update(String(source.length))
    hash.update('\0')
    hash.update(source)
  }

  return hash.digest('hex')
}

/**
 * 收窄磁盘中的缓存记录
 */
function isRepositoryGuardCache(value: unknown): value is RepositoryGuardCache {
  return typeof value === 'object'
    && value !== null
    && 'digest' in value
    && typeof value.digest === 'string'
    && 'version' in value
    && typeof value.version === 'number'
}

/**
 * 统一仓库相对路径分隔符
 */
function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}
