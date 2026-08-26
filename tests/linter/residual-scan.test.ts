import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  readManifestResidualDiagnostics,
  readSourceResidualDiagnostics,
  scanRepositoryResiduals,
} from './residual-scan'

// cspell:ignore electronish qygent Qiyan

/** -------------------- 测试工具 -------------------- */
const legacyProductAgent = ['Qiyan', 'Agent'].join('')
const legacyProductSoft = ['Qiyan', 'Soft'].join('')
const templateDomainInterpolation = '${' + 'domain}'

function writeRepositoryFiles(root: string, files: Readonly<Record<string, string>>) {
  for (const [filePath, source] of Object.entries(files)) {
    const absolutePath = path.join(root, filePath)

    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, source)
  }
}

/** -------------------- 残留扫描 -------------------- */
it('源码残留扫描捕获旧包、内部领域包、源码模块与产品标识', async () => {
  const diagnostics = await readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/invalid.ts',
    source: [
      'import agentPackage from \'@qygent/agent\'',
      'import runtimePackage from \'@socilab/runtime\'',
      'import threadModule from \'../../thread/index\'',
      'import electronBuilder from \'electron-builder\'',
      'import electronPackager from \'@electron/packager\'',
      'import electronMain from \'electron/main\'',
      'import pluginPackage from \'@socilab/plugin\'',
      'import threadPackage from \'@socilab/thread\'',
      'import socilabAgentPackage from \'@socilab/agent\'',
      'import socilabElectronPackage from \'@socilab/electron\'',
      'import electronRenderer from \'electron/renderer\'',
      '',
      `const productAgent = ${JSON.stringify(legacyProductAgent)}`,
      `const productSoft = ${JSON.stringify(legacyProductSoft)}`,
      'const Agent = true',
      'const Electron = true',
      '',
      'export {',
      '  agentPackage,',
      '  runtimePackage,',
      '  threadModule,',
      '  electronBuilder,',
      '  electronPackager,',
      '  electronMain,',
      '  pluginPackage,',
      '  threadPackage,',
      '  socilabAgentPackage,',
      '  socilabElectronPackage,',
      '  electronRenderer,',
      '}',
    ].join('\n'),
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
    [1, 26],
    [2, 28],
    [3, 26],
  ])
  expect(diagnostics.filter(item => item.kind !== 'module').map(item => item.value)).toEqual([
    ['Qiyan', 'Agent'].join(''),
    ['Qiyan', 'Soft'].join(''),
    'Agent',
    'Electron',
  ])
})

it('源码残留扫描允许生态插件包与普通复合技术词', async () => {
  expect(await readSourceResidualDiagnostics([{
    filePath: 'vite.config.ts',
    source: [
      'import { TanStackRouterVite } from \'@tanstack/router-plugin\'',
      'import react from \'@vitejs/plugin-react\'',
      '',
      'const electronLike = \'electronish\'',
      'const pluginName = \'router-plugin\'',
      '',
      'export default [TanStackRouterVite(), react(), electronLike, pluginName]',
    ].join('\n'),
  }])).toEqual([])
})

it('源码残留扫描捕获 import equals、类型导入、require 与动态 import 模块形态', async () => {
  const diagnostics = await readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/module-forms.ts',
    source: [
      'import ElectronBuilder = require(\'electron-builder\')',
      '',
      'type ElectronRenderer = import(\'electron/renderer\').WebContents',
      '',
      'const electronMain = require(\'electron/main\')',
      'const agentModule = import(\'@socilab/agent\')',
      'const threadModule = import(\'@socilab/thread\')',
      '',
      'export { ElectronBuilder, agentModule, electronMain, threadModule }',
      'export type { ElectronRenderer }',
    ].join('\n'),
  }])

  expect(diagnostics.filter(item => item.kind === 'module').map(item => item.value)).toEqual([
    'electron-builder',
    'electron/renderer',
    'electron/main',
    '@socilab/agent',
    '@socilab/thread',
  ])
})

it('源码残留扫描允许 electronic 与 @example/electron 等 near-miss 模块', async () => {
  expect(await readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/near-miss.ts',
    source: [
      'import electronic from \'electronic\'',
      'import exampleElectron from \'@example/electron\'',
      '',
      'const electronicCommonJs = require(\'electronic\')',
      'const exampleElectronDynamic = import(\'@example/electron\')',
      '',
      'export {',
      '  electronic,',
      '  electronicCommonJs,',
      '  exampleElectron,',
      '  exampleElectronDynamic,',
      '}',
    ].join('\n'),
  }])).toEqual([])
})

it('源码残留扫描识别无替换模板说明符且忽略表达式模板', async () => {
  const diagnostics = await readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/template-modules.ts',
    source: [
      'const pluginModule = import(`@socilab/plugin`)',
      'const runtimeModule = require(`../../runtime/index`)',
      'const domain = \'thread\'',
      `const unknownModule = import(\`../../${templateDomainInterpolation}/index\`)`,
      '',
      'export { pluginModule, runtimeModule, unknownModule }',
    ].join('\n'),
  }])

  expect(diagnostics.filter(item => item.kind === 'module').map(item => item.value))
    .toEqual(['@socilab/plugin', '../../runtime/index'])
})

it('manifest 残留扫描分析依赖键而非原始 substring', () => {
  expect(readManifestResidualDiagnostics(
    'fixtures/invalid/package.json',
    JSON.stringify({
      dependencies: {
        '@qygent/shared': 'workspace:*',
        '@socilab/plugin': 'workspace:*',
      },
      devDependencies: {
        '@electron/packager': '^1.0.0',
        'electron': '^1.0.0',
      },
      optionalDependencies: {
        'electron/renderer': '^1.0.0',
      },
      scripts: {
        legacy: 'electron-builder',
      },
    }),
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
    JSON.stringify({
      dependencies: {
        '@tanstack/router-plugin': '^1.0.0',
      },
      scripts: {
        build: 'vite build',
      },
    }),
  )).toEqual([])
})

it('真实仓库扫描覆盖配置、样式、HTML、非 fixture 测试与 package scripts', async () => {
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

    expect((await scanRepositoryResiduals(root)).map(item => [item.filePath, item.kind, item.value])).toEqual([
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

it('真实仓库扫描排除受控目录并允许计划强制的构建插件包名', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'socilab-residual-valid-'))
  const ignoredManifest = JSON.stringify({
    dependencies: { '@qygent/shared': 'workspace:*' },
  })

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
      'packages/.cache/package.json': ignoredManifest,
      'packages/.codegraph/package.json': ignoredManifest,
      'packages/.git/package.json': ignoredManifest,
      'packages/.pnpm-store/package.json': ignoredManifest,
      'packages/.tanstack/package.json': ignoredManifest,
      'packages/.tmp/package.json': ignoredManifest,
      'packages/.turbo/package.json': ignoredManifest,
      'packages/build/package.json': ignoredManifest,
      'packages/coverage/package.json': ignoredManifest,
      'packages/dist/package.json': ignoredManifest,
      'packages/example/.cache/Agent.ts': 'export const Agent = true\n',
      'packages/example/.codegraph/Agent.ts': 'export const Agent = true\n',
      'packages/example/.git/Agent.ts': 'export const Agent = true\n',
      'packages/example/.pnpm-store/Agent.ts': 'export const Agent = true\n',
      'packages/example/.tanstack/Agent.ts': 'export const Agent = true\n',
      'packages/example/.tmp/Agent.ts': 'export const Agent = true\n',
      'packages/example/.turbo/Agent.ts': 'export const Agent = true\n',
      'packages/example/build/Thread.js': 'export const Thread = true\n',
      'packages/example/coverage/Agent.ts': 'export const Agent = true\n',
      'packages/example/dist/Agent.ts': 'export const Agent = true\n',
      'packages/example/node_modules/electron/index.js': 'export const Electron = true\n',
      'packages/example/src/routeTree.gen.ts': 'export const Plugin = true\n',
      'packages/example/tmp/Agent.ts': 'export const Agent = true\n',
      'packages/node_modules/package.json': ignoredManifest,
      'packages/tmp/package.json': ignoredManifest,
      'projects/web/dist/Agent.js': 'export const Agent = true\n',
      'tests/request/valid.test.ts': 'export const pluginName = "router-plugin"\n',
    })

    expect(await scanRepositoryResiduals(root)).toEqual([])
  }
  finally {
    rmSync(root, { force: true, recursive: true })
  }
})

it('真实仓库源码、配置与依赖声明无领域残留', async () => {
  expect(await scanRepositoryResiduals()).toEqual([])
})
