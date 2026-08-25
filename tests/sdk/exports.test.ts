import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

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
        'const client = Client.create({ baseUrl: \'https://exports.example.test/\' })',
        'console.log(JSON.stringify({ plain: isPlainRecord({}), info: metaInfoSchema.parse({ name: \'SociLab\', version: \'0.1.0\' }), request: typeof createRequest, baseUrl: client.baseUrl }))',
      ].join(';'),
    ], {
      cwd: fileURLToPath(new URL('../../packages/sdk', import.meta.url)),
      encoding: 'utf8',
    })

    expect(JSON.parse(output)).toEqual({
      plain: true,
      info: { name: 'SociLab', version: '0.1.0' },
      request: 'function',
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
})
