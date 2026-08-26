import { describe, expect, it } from 'vitest'
import { createAdminViteConfig } from '../../projects/admin/vite.config'

describe('admin vite config', () => {
  it('把 Admin 环境覆盖同时应用到开发、预览和基础路径', () => {
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
