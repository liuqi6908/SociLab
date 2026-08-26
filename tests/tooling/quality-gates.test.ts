import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const root = fileURLToPath(new URL('../..', import.meta.url))

/** -------------------- 测试 -------------------- */
test('根质量脚本通过 Turbo 调用不放行空集合的仓库任务', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

  expect(manifest.scripts).toMatchObject({
    'lint': 'turbo run lint:repo',
    'lint:repo': 'eslint --cache .',
    'test': 'turbo run test:repo',
    'test:repo': 'vitest run',
    'test:linter': 'turbo run test:linter:repo',
    'test:linter:repo': 'vitest run tests/linter',
    'typecheck': 'turbo run typecheck:repo',
    'typecheck:repo': 'node node_modules/@typescript/native/bin/tsc',
  })
  const workspaceManifests = ['packages', 'projects'].flatMap(group => (
    readdirSync(path.join(root, group), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => JSON.parse(
        readFileSync(path.join(root, group, entry.name, 'package.json'), 'utf8'),
      ))
  ))

  const serializedManifests = [manifest, ...workspaceManifests]
    .map(value => JSON.stringify(value))
    .join('\n')

  expect(serializedManifests).not.toContain('passWithNoTests')
  for (const workspace of workspaceManifests) {
    expect(workspace.scripts ?? {}).not.toHaveProperty('test')
    expect(workspace.scripts ?? {}).not.toHaveProperty('typecheck')
  }
})

test('turbo 根类型和 lint 任务覆盖全部源码与测试', () => {
  const turbo = JSON.parse(readFileSync(path.join(root, 'turbo.json'), 'utf8'))

  for (const taskName of ['//#lint:repo', '//#typecheck:repo']) {
    expect(turbo.tasks[taskName].inputs).toEqual(expect.arrayContaining([
      '$TURBO_DEFAULT$',
      'packages/**',
      'projects/**',
      'tests/**',
    ]))
  }
  expect(turbo.tasks['//#test:repo']).toMatchObject({ cache: false })
  expect(turbo.tasks['//#test:linter:repo']).toMatchObject({ cache: false })
})

test('pnpm 固定运行时并启用依赖完整性保护', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const workspace = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')

  expect(manifest.engines).toEqual({
    node: '>=24.18.1 <25',
    pnpm: '11.18.0',
  })
  expect(manifest.devDependencies['@rolldown/plugin-babel']).toBe('0.2.3')
  expect(manifest.devDependencies['@vitejs/plugin-react']).toBe('6.0.5')
  expect(workspace).toContain('nodeVersion: 24.18.1')
  expect(workspace).toContain('enableGlobalVirtualStore: false')
  expect(workspace).toContain('shellEmulator: true')
  expect(workspace).toContain('strictDepBuilds: true')
  expect(workspace).toContain('trustPolicy: no-downgrade')
  expect(workspace).toContain('verifyDepsBeforeRun: error')
})
