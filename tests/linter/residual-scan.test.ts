import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  readManifestResidualDiagnostics,
  readSourceResidualDiagnostics,
  scanRepositoryResiduals,
} from './residual-scan'

// cspell:ignore qygent Qiyan

/** -------------------- 测试夹具 -------------------- */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/residual')

function readFixture(name: string) {
  return readFileSync(path.join(fixtureRoot, name), 'utf8')
}

function writeRepositoryFiles(root: string, files: Readonly<Record<string, string>>) {
  for (const [filePath, source] of Object.entries(files)) {
    const absolutePath = path.join(root, filePath)

    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, source)
  }
}

/** -------------------- 残留扫描 -------------------- */
it('源码残留扫描捕获旧包、内部领域包、源码模块与产品标识', () => {
  const diagnostics = readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/invalid.ts',
    source: readFixture('invalid-source.fixture'),
  }])

  expect(diagnostics.filter(item => item.kind === 'module').map(item => item.value)).toEqual([
    '@qygent/agent',
    '@socilab/runtime',
    '../../thread/index',
    'electron-builder',
    '@electron/packager',
    'electron/main',
    '@socilab/plugin',
    '@socilab/thread',
    '@socilab/agent',
    '@socilab/electron',
    'electron/renderer',
  ])
  expect(diagnostics.filter(item => item.kind === 'module').slice(0, 3).map(item => (
    [item.line, item.column]
  ))).toEqual([
    [1, 29],
    [2, 30],
    [3, 30],
  ])
  expect(diagnostics.filter(item => item.kind !== 'module').map(item => item.value)).toEqual([
    ['Qiyan', 'Agent'].join(''),
    ['Qiyan', 'Soft'].join(''),
    'Agent',
    'Electron',
  ])
})

it('源码残留扫描允许生态插件包与普通复合技术词', () => {
  expect(readSourceResidualDiagnostics([{
    filePath: 'vite.config.ts',
    source: readFixture('valid-source.fixture'),
  }])).toEqual([])
})

it('manifest 残留扫描分析依赖键而非原始 substring', () => {
  expect(readManifestResidualDiagnostics(
    'fixtures/invalid/package.json',
    readFixture('invalid-manifest.fixture'),
  ).map(item => item.value)).toEqual([
    '@qygent/shared',
    '@socilab/plugin',
    '@electron/packager',
    'electron',
    'electron/renderer',
    'electron-builder',
  ])

  expect(readManifestResidualDiagnostics(
    'fixtures/valid/package.json',
    readFixture('valid-manifest.fixture'),
  )).toEqual([])
})

it('真实仓库扫描覆盖配置、样式、HTML、非 fixture 测试与 package scripts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-residual-'))

  try {
    writeRepositoryFiles(root, {
      'package.json': JSON.stringify({
        scripts: { legacy: 'node ./Agent.js' },
      }),
      'packages/example/package.json': JSON.stringify({ name: '@socilab/example' }),
      'packages/example/src/styles.css': '.Runtime { display: block; }\n',
      'projects/web/package.json': JSON.stringify({ name: '@socilab/web' }),
      'projects/web/index.html': '<main data-owner="Thread"></main>\n',
      'tests/request/residual.test.ts': 'const Plugin = true\n',
      'turbo.json': JSON.stringify({ extends: ['@qygent/build'] }),
    })

    expect(scanRepositoryResiduals(root).map(item => [item.filePath, item.kind, item.value])).toEqual([
      ['packages/example/src/styles.css', 'identifier', 'Runtime'],
      ['projects/web/index.html', 'identifier', 'Thread'],
      ['tests/request/residual.test.ts', 'identifier', 'Plugin'],
      ['turbo.json', 'module', '@qygent/build'],
      ['package.json', 'script', 'Agent'],
    ])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('真实仓库扫描排除受控目录并允许计划强制的构建插件包名', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-residual-valid-'))

  try {
    writeRepositoryFiles(root, {
      'package.json': JSON.stringify({
        devDependencies: {
          '@rolldown/plugin-babel': '^0.2.3',
          '@tanstack/router-plugin': '^1.139.16',
          '@vitejs/plugin-react': '^6.0.5',
          'babel-plugin-react-compiler': '1.0.0',
        },
      }),
      '.superpowers/Runtime.ts': 'export const Runtime = true\n',
      'docs/Agent.md': '# Agent\n',
      'packages/example/build/Thread.js': 'export const Thread = true\n',
      'packages/example/node_modules/electron/index.js': 'export const Electron = true\n',
      'packages/example/src/routeTree.gen.ts': 'export const Plugin = true\n',
      'projects/web/dist/Agent.js': 'export const Agent = true\n',
      'tests/linter/fixtures/Plugin.ts': 'export const Plugin = true\n',
      'tests/request/valid.test.ts': 'export const pluginName = "router-plugin"\n',
    })

    expect(scanRepositoryResiduals(root)).toEqual([])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('真实仓库源码、配置与依赖声明无领域残留', () => {
  expect(scanRepositoryResiduals()).toEqual([])
})
