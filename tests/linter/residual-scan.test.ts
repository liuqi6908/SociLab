import { readFileSync } from 'node:fs'
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

/** -------------------- 残留扫描 -------------------- */
it('源码残留扫描捕获旧包、内部领域包、源码模块与产品标识', () => {
  const diagnostics = readSourceResidualDiagnostics([{
    filePath: 'projects/client/src/invalid.ts',
    source: readFixture('invalid-source.fixture'),
  }])

  expect(diagnostics.map(item => item.value)).toEqual([
    '@qygent/agent',
    '@socilab/runtime',
    '../../thread/index',
    'QiyanAgent',
    'QiyanSoft',
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
    'electron',
  ])

  expect(readManifestResidualDiagnostics(
    'fixtures/valid/package.json',
    readFixture('valid-manifest.fixture'),
  )).toEqual([])
})

it('真实仓库源码、配置与依赖声明无领域残留', () => {
  expect(scanRepositoryResiduals()).toEqual([])
})
