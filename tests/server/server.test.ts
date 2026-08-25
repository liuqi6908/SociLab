import { ApiError } from '@socilab/api'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../projects/server/src/app'

/** 创建内存服务请求 */
function request(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
) {
  return app.fetch(new Request(`http://server.test${path}`, init))
}

describe('server', () => {
  it('通过 RPC 暴露唯一的 meta.info 过程', async () => {
    const response = await request(createApp(), '/api/rpc/meta/info')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      json: {
        name: 'SociLab',
        version: '0.1.0',
      },
    })
  })

  it('在 OpenAPI 入口公开 meta.info 契约', async () => {
    const response = await request(createApp(), '/api/openapi/spec.json')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      info: { title: 'SociLab API', version: '0.1.0' },
      paths: {
        '/meta/info': {
          get: expect.any(Object),
        },
      },
    })
  })

  it('仅为已配置 Origin 写入 CORS 响应头', async () => {
    const app = createApp({ corsOrigins: ['https://console.socilab.test'] })
    const allowed = await request(app, '/api/rpc/meta/info', {
      headers: { origin: 'https://console.socilab.test' },
    })
    const rejected = await request(app, '/api/rpc/meta/info', {
      headers: { origin: 'https://untrusted.example.test' },
    })

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://console.socilab.test')
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('将无效 RPC 输入映射为可供调用方处理的校验错误', async () => {
    const response = await request(createApp(), '/api/rpc/meta/info?data=%7B%22json%22%3A%22unexpected%22%7D')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      message: 'Input validation failed',
      code: 'BAD_REQUEST',
      details: {
        issues: [
          expect.objectContaining({
            code: expect.any(String),
            message: expect.any(String),
            path: expect.any(String),
          }),
        ],
      },
    })
  })

  it('将 meta.info 的应用错误转换为公共错误结构', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => {
          throw new ApiError(409, '服务信息冲突', {
            code: 'META_CONFLICT',
            details: { field: 'version' },
          })
        },
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      message: '服务信息冲突',
      code: 'META_CONFLICT',
      details: { field: 'version' },
    })
  })

  it('隐藏 meta.info 未知异常的内部细节', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => {
          throw new Error('database password: should-not-leak')
        },
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      message: '服务器内部错误',
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})
