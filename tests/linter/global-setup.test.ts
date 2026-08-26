import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'vitest'
import setupRepositoryGuards, { runRepositoryGuards } from './global-setup'

/** -------------------- 常量 -------------------- */
/** 当前待注册的 Vitest 全仓守卫入口 */
const globalSetupPath = path.resolve(import.meta.dirname, 'global-setup.ts')
/** 仓库已安装的 Vitest CLI */
const vitestPath = path.resolve(
  import.meta.dirname,
  '../../node_modules/vitest/vitest.mjs',
)

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

/**
 * 创建全仓守卫可扫描的最小仓库根目录
 */
function createRepositoryRoot(prefix: string) {
  const root = mkdtempSync(path.join(tmpdir(), prefix))

  for (const dir of ['packages', 'projects', 'tests'])
    mkdirSync(path.join(root, dir))
  writeFileSync(path.join(root, 'package.json'), '{}')

  return root
}

/** -------------------- 测试 -------------------- */
test('全仓 setup 同时报告质量与残留 gate 的真实诊断', async () => {
  const root = createRepositoryRoot('socilab-global-setup-invalid-')

  try {
    writeRepositoryFiles(root, {
      'packages/example/src/index.ts': 'export default true\n',
      'projects/client/src/styles/index.css': '.Runtime { display: block; }\n',
    })

    const running = runRepositoryGuards(root)

    await expect(running).rejects.toThrow('explicit-exports')
    await expect(running).rejects.toThrow('Runtime')
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('同一次 Vitest run 执行两个 spec 时只完成一次全仓 setup', () => {
  const root = createRepositoryRoot('socilab-global-setup-once-')
  const setupTracePath = path.join(root, 'setup.log')
  const specTracePath = path.join(root, 'spec.log')

  try {
    const setupUrl = pathToFileURL(globalSetupPath).href
    const setupTrace = JSON.stringify(setupTracePath)
    const specTrace = JSON.stringify(specTracePath)

    writeRepositoryFiles(root, {
      'global-setup.ts': [
        'import { appendFileSync } from \'node:fs\'',
        `import setupRepositoryGuards from ${JSON.stringify(setupUrl)}`,
        '',
        'export default async function setup(',
        '  project: Parameters<typeof setupRepositoryGuards>[0],',
        ') {',
        '  await setupRepositoryGuards(project)',
        `  appendFileSync(${setupTrace}, 'setup\\n')`,
        '}',
        '',
      ].join('\n'),
      'tests/first/first.test.ts': [
        'import { appendFileSync } from \'node:fs\'',
        '',
        'test(\'执行第一个 spec\', () => {',
        `  appendFileSync(${specTrace}, 'first\\n')`,
        '})',
        '',
      ].join('\n'),
      'tests/second/second.test.ts': [
        'import { appendFileSync } from \'node:fs\'',
        '',
        'test(\'执行第二个 spec\', () => {',
        `  appendFileSync(${specTrace}, 'second\\n')`,
        '})',
        '',
      ].join('\n'),
      'vitest.config.mjs': [
        'export default {',
        '  test: {',
        '    environment: \'node\',',
        '    globalSetup: [\'./global-setup.ts\'],',
        '    globals: true,',
        '    include: [\'tests/**/*.test.ts\'],',
        '    maxWorkers: 2,',
        '  },',
        '}',
        '',
      ].join('\n'),
    })

    execFileSync(process.execPath, [
      vitestPath,
      'run',
      '--config',
      path.join(root, 'vitest.config.mjs'),
    ], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    })

    expect(readFileSync(setupTracePath, 'utf8')).toBe('setup\n')
    expect(readFileSync(specTracePath, 'utf8').trim().split('\n').sort()).toEqual([
      'first',
      'second',
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('默认 Vitest setup 入口委托当前项目根目录', async () => {
  const root = createRepositoryRoot('socilab-global-setup-root-')

  try {
    await setupRepositoryGuards({ config: { root } })
    const cache: unknown = JSON.parse(
      readFileSync(path.join(root, '.cache/tests/linter/guard.json'), 'utf8'),
    )

    expect(cache).toMatchObject({ digest: expect.stringMatching(/^[a-f\d]{64}$/) })
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})
