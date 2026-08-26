import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { describe, expect, test } from 'vitest'
import { createAdminViteConfig } from '../../projects/admin/vite.config'

describe('admin vite config', () => {
  test('环境示例可以直接创建默认 Admin 配置', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'projects/admin/.env.example'),
      'utf8',
    )
    const config = createAdminViteConfig(parseEnv(source))

    expect(config).toMatchObject({
      base: '/',
      preview: { host: '0.0.0.0', port: 4319 },
      server: {
        host: '0.0.0.0',
        port: 4319,
        proxy: {
          '/api': { target: 'http://127.0.0.1:4317' },
        },
      },
    })
  })

  test('把 Admin 环境覆盖同时应用到开发、预览和基础路径', () => {
    const config = createAdminViteConfig({
      ADMIN_API_PROXY_TARGET: 'https://server.example.test',
      ADMIN_BASE_PATH: '/management/',
      ADMIN_HOST: '127.0.0.1',
      ADMIN_PORT: '4500',
    })

    expect(config).toMatchObject({
      base: '/management/',
      preview: {
        host: '127.0.0.1',
        port: 4500,
        strictPort: true,
      },
      server: {
        host: '127.0.0.1',
        port: 4500,
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
