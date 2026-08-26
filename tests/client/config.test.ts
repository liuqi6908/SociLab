import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { createClientViteConfig } from '../../projects/client/vite.config'

describe('client vite config', () => {
  it('环境示例可以直接创建默认 Client 配置', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'projects/client/.env.example'),
      'utf8',
    )
    const config = createClientViteConfig(parseEnv(source))

    expect(config).toMatchObject({
      base: '/',
      preview: { host: '0.0.0.0', port: 4318 },
      server: {
        host: '0.0.0.0',
        port: 4318,
        proxy: {
          '/api': { target: 'http://127.0.0.1:4317' },
        },
      },
    })
  })

  it('把 Client 环境覆盖同时应用到开发、预览和基础路径', () => {
    const config = createClientViteConfig({
      CLIENT_API_PROXY_TARGET: 'https://server.example.test',
      CLIENT_BASE_PATH: '/learning/',
      CLIENT_HOST: '127.0.0.1',
      CLIENT_PORT: '4400',
    })

    expect(config).toMatchObject({
      base: '/learning/',
      preview: {
        host: '127.0.0.1',
        port: 4400,
        strictPort: true,
      },
      server: {
        host: '127.0.0.1',
        port: 4400,
        proxy: {
          '/api': {
            target: 'https://server.example.test',
            ws: true,
          },
        },
        strictPort: true,
      },
    })
  })
})
