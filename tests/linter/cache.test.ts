import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { readRepositoryGuardInputs, runCachedRepositoryGuards } from './cache'

/** -------------------- 测试工具 -------------------- */
/**
 * 写入临时仓库文件
 */
function writeRepositoryFiles(root: string, files: Readonly<Record<string, string>>) {
  for (const [filePath, source] of Object.entries(files)) {
    const absolutePath = path.join(root, filePath)

    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, source)
  }
}

/** -------------------- 测试 -------------------- */
it('缓存输入覆盖源码、两端构建路由、共享样式与工程配置并排除生成目录', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-inputs-'))

  try {
    writeRepositoryFiles(root, {
      '.cache/tests/linter/guard.json': '{}',
      '.codegraph/index.json': '{}',
      '.npmrc': 'engine-strict=true\n',
      'eslint.config.mjs': 'export default []\n',
      'package.json': '{}',
      'packages/api/.cache/ignored.ts': 'export const ignored = true\n',
      'packages/api/.codegraph/ignored.ts': 'export const ignored = true\n',
      'packages/api/.git/ignored.ts': 'export const ignored = true\n',
      'packages/api/.pnpm-store/ignored.ts': 'export const ignored = true\n',
      'packages/api/.tanstack/ignored.ts': 'export const ignored = true\n',
      'packages/api/.tmp/ignored.ts': 'export const ignored = true\n',
      'packages/api/.turbo/ignored.ts': 'export const ignored = true\n',
      'packages/api/build/ignored.ts': 'export const ignored = true\n',
      'packages/api/coverage/ignored.ts': 'export const ignored = true\n',
      'packages/api/dist/index.js': 'export const generated = true\n',
      'packages/api/node_modules/ignored.ts': 'export const ignored = true\n',
      'packages/api/package.json': '{}',
      'packages/api/src/index.ts': 'export const api = true\n',
      'packages/api/tmp/ignored.ts': 'export const ignored = true\n',
      'packages/shared-ui/src/styles.css': ':root { color: black; }\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'pnpm-workspace.yaml': 'packages: []\n',
      'projects/admin/src/routeTree.gen.ts': 'export const generated = true\n',
      'projects/admin/src/router.tsx': 'export const router = true\n',
      'projects/admin/vite.config.ts': 'export const config = true\n',
      'projects/client/node_modules/example/index.ts': 'export const dependency = true\n',
      'projects/client/src/router.tsx': 'export const router = true\n',
      'projects/client/vite.config.ts': 'export const config = true\n',
      'tests/linter/cache.test.ts': 'export const test = true\n',
      'tests/linter/inline-source.test.ts': 'export const inlineSource = true\n',
      'tsconfig.json': '{}',
      'turbo.json': '{}',
      'vitest.config.ts': 'export const config = true\n',
    })

    expect(readRepositoryGuardInputs(root).map(item => item.filePath)).toEqual([
      '.npmrc',
      'eslint.config.mjs',
      'package.json',
      'packages/api/package.json',
      'packages/api/src/index.ts',
      'packages/shared-ui/src/styles.css',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'projects/admin/src/router.tsx',
      'projects/admin/vite.config.ts',
      'projects/client/src/router.tsx',
      'projects/client/vite.config.ts',
      'tests/linter/cache.test.ts',
      'tests/linter/inline-source.test.ts',
      'tsconfig.json',
      'turbo.json',
      'vitest.config.ts',
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('缓存首次运行后命中相同输入', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-'))
  let runCount = 0

  try {
    writeRepositoryFiles(root, {
      'package.json': '{}',
      'packages/example/src/index.ts': 'export const value = 1\n',
    })

    for (let index = 0; index < 2; index++) {
      await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
        runCount += 1
      }, root)
    }

    expect(runCount).toBe(1)
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('缓存会因源码与受控输入变化失效且不依赖 mtime 变化', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-invalidation-'))
  const sourcePath = path.join(root, 'packages/example/src/index.ts')
  let runCount = 0

  try {
    writeRepositoryFiles(root, {
      '.npmrc': 'engine-strict=true\n',
      'package.json': '{}',
      'packages/example/src/index.ts': 'export const value = 1\n',
    })
    const timestamp = statSync(sourcePath)

    await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
      runCount += 1
    }, root)

    writeFileSync(sourcePath, 'export const value = 2\n')
    utimesSync(sourcePath, timestamp.atime, timestamp.mtime)
    await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
      runCount += 1
    }, root)

    writeFileSync(path.join(root, '.npmrc'), 'engine-strict=false\n')
    await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
      runCount += 1
    }, root)

    expect(runCount).toBe(3)
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('失败的全仓守卫不会写入成功缓存', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-failure-'))
  let runCount = 0

  try {
    writeRepositoryFiles(root, { 'package.json': '{}' })
    const inputs = readRepositoryGuardInputs(root)

    await expect(runCachedRepositoryGuards(inputs, () => {
      runCount += 1
      throw new Error('受控失败')
    }, root)).rejects.toThrow('受控失败')

    await runCachedRepositoryGuards(inputs, () => {
      runCount += 1
    }, root)

    expect(runCount).toBe(2)
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('并发命中同一输入时只执行一次并清理锁目录', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-concurrent-'))
  let resolveRun!: () => void
  let runCount = 0

  try {
    writeRepositoryFiles(root, {
      'package.json': '{}',
      'packages/example/src/index.ts': 'export const value = 1\n',
    })
    const inputs = readRepositoryGuardInputs(root)
    const firstRun = runCachedRepositoryGuards(inputs, async () => {
      runCount += 1
      await new Promise<void>((resolve) => {
        resolveRun = resolve
      })
    }, root)

    await new Promise(resolve => setTimeout(resolve, 0))

    const secondRun = runCachedRepositoryGuards(inputs, () => {
      runCount += 1
    }, root)

    expect(runCount).toBe(1)

    resolveRun()
    await Promise.all([firstRun, secondRun])

    expect(runCount).toBe(1)
    expect(readdirSync(path.join(root, '.cache/tests/linter'))).toEqual([
      'guard.json',
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('等待缓存锁超时后抛出可操作错误', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-timeout-'))
  const lockDir = path.join(root, '.cache/tests/linter/guard.json.lock')
  let runCount = 0

  try {
    writeRepositoryFiles(root, {
      'package.json': '{}',
      'packages/example/src/index.ts': 'export const value = 1\n',
    })
    mkdirSync(lockDir, { recursive: true })

    await expect(runCachedRepositoryGuards(
      readRepositoryGuardInputs(root),
      () => {
        runCount += 1
      },
      root,
      { lockTimeoutMs: 20 },
    )).rejects.toThrow(
      `等待全仓守卫缓存锁超时：${lockDir}。若上一轮守卫已异常退出，请删除该锁目录后重试`,
    )

    expect(runCount).toBe(0)
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})
