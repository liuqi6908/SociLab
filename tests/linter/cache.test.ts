import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  readRepositoryGuardInputs,
  runCachedRepositoryGuards,
} from './cache'

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
      'packages/api/dist/index.js': 'export const generated = true\n',
      'packages/api/package.json': '{}',
      'packages/api/src/index.ts': 'export const api = true\n',
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
      'tests/linter/fixtures/invalid.ts': 'export const invalid = true\n',
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
      'tsconfig.json',
      'turbo.json',
      'vitest.config.ts',
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('缓存由输入内容失效且不依赖 mtime 变化', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-guard-cache-'))
  const configPath = path.join(root, 'tsconfig.json')
  let runCount = 0

  try {
    writeRepositoryFiles(root, {
      'package.json': '{}',
      'tsconfig.json': '{}',
    })
    const timestamp = statSync(configPath)

    for (let index = 0; index < 2; index++) {
      await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
        runCount += 1
      }, root)
    }
    expect(runCount).toBe(1)

    writeFileSync(configPath, '{"compilerOptions":{}}')
    utimesSync(configPath, timestamp.atime, timestamp.mtime)
    await runCachedRepositoryGuards(readRepositoryGuardInputs(root), () => {
      runCount += 1
    }, root)

    expect(runCount).toBe(2)
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
