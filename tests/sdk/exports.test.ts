import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

/** -------------------- 类型 -------------------- */
interface ServerPackageManifest {
  /** server 根出口 */
  exports: {
    /** 默认公开出口 */
    '.': {
      /** 运行时构建产物 */
      default: string
      /** 类型声明产物 */
      types: string
    }
  }
}

/** -------------------- 常量 -------------------- */
/** 仓库根目录 */
const rootDir = fileURLToPath(new URL('../..', import.meta.url))
/** server workspace 目录 */
const serverDir = path.join(rootDir, 'projects/server')
/** 当前 workspace 安装的 TypeScript 编译入口 */
const tscPath = path.join(rootDir, 'node_modules/typescript/bin/tsc')

describe('workspace package exports', () => {
  it('resolves every public package through Node bare specifiers', () => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      [
        'import { isPlainRecord } from \'@socilab/shared\'',
        'import { metaInfoSchema } from \'@socilab/api\'',
        'import { createRequest } from \'@socilab/request\'',
        'import { Client } from \'@socilab/sdk\'',
        'import { createApiQueryUtils } from \'@socilab/sdk/query\'',
        'const client = Client.create({ baseUrl: \'https://exports.example.test/\' })',
        'console.log(JSON.stringify({ plain: isPlainRecord({}), info: metaInfoSchema.parse({ name: \'SociLab\', version: \'0.1.0\' }), request: typeof createRequest, query: typeof createApiQueryUtils, baseUrl: client.baseUrl }))',
      ].join(';'),
    ], {
      cwd: fileURLToPath(new URL('../../packages/sdk', import.meta.url)),
      encoding: 'utf8',
    })

    expect(JSON.parse(output)).toEqual({
      plain: true,
      info: { name: 'SociLab', version: '0.1.0' },
      request: 'function',
      query: 'function',
      baseUrl: 'https://exports.example.test',
    })
  })

  it('bundles package dependencies through Vite public entry resolution', async () => {
    const root = fileURLToPath(new URL('../../packages/sdk', import.meta.url))
    const bundle = await build({
      build: {
        ssr: 'src/index.ts',
        write: false,
      },
      configFile: false,
      logLevel: 'silent',
      root,
      ssr: {
        noExternal: ['@socilab/api', '@socilab/request', '@socilab/shared'],
      },
    })
    const outputs = Array.isArray(bundle)
      ? bundle.flatMap(item => ('output' in item ? item.output : []))
      : 'output' in bundle
        ? bundle.output
        : []

    expect(outputs.some(item => (
      item.type === 'chunk'
      && item.code.includes('SociLab')
      && item.code.includes('createRequest')
    ))).toBe(true)
  })

  it('freshly builds and resolves the server public package export', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'socilab-server-export-'))
    const packageDir = path.join(fixtureRoot, 'node_modules/@socilab/server')
    const manifest = JSON.parse(readFileSync(
      path.join(serverDir, 'package.json'),
      'utf8',
    )) as ServerPackageManifest

    try {
      mkdirSync(packageDir, { recursive: true })
      writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest))
      symlinkSync(path.join(serverDir, 'node_modules'), path.join(packageDir, 'node_modules'), 'dir')
      execFileSync(process.execPath, [
        tscPath,
        '--project',
        path.join(serverDir, 'tsconfig.json'),
        '--outDir',
        path.join(packageDir, 'dist'),
      ], {
        cwd: rootDir,
        encoding: 'utf8',
      })

      expect(resolveServerExport(fixtureRoot)).toBe('function')
      expect(existsSync(path.join(packageDir, manifest.exports['.'].types))).toBe(true)

      writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
        ...manifest,
        exports: {
          '.': {
            ...manifest.exports['.'],
            default: './dist/missing.js',
          },
        },
      }))

      expect(() => resolveServerExport(fixtureRoot)).toThrow()
    }
    finally {
      rmSync(fixtureRoot, { force: true, recursive: true })
    }
  })
})

/** -------------------- 测试工具 -------------------- */
/** 通过 Node bare specifier 读取 server 运行时出口 */
function resolveServerExport(cwd: string) {
  return execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    'import { startServer } from \'@socilab/server\'; console.log(typeof startServer)',
  ], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}
