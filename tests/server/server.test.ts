import { ORPCError } from '@orpc/server'
import { ApiError } from '@socilab/api'
import { describe, expect, test } from 'vitest'
import { createApp } from '../../projects/server/src/app/define'

/** 创建内存服务请求 */
function request(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
) {
  return app.fetch(new Request(`http://server.test${path}`, init))
}

describe('server', () => {
  test('通过 RPC 暴露唯一的 meta.info 过程', async () => {
    const response = await request(createApp(), '/api/rpc/meta/info')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      json: {
        name: 'SociLab',
        version: '0.1.0',
      },
    })
  })

  test('在 OpenAPI 入口只公开 meta.info 契约并可实际调用', async () => {
    const app = createApp()
    const documentResponse = await request(app, '/api/openapi/spec.json')
    const procedureResponse = await request(app, '/api/openapi/meta/info')

    expect(documentResponse.status).toBe(200)
    await expect(documentResponse.json()).resolves.toMatchObject({
      info: { title: 'SociLab API', version: '0.1.0' },
    })
    const document = await (await request(app, '/api/openapi/spec.json')).json()

    expect(Object.keys(document.paths)).toEqual(['/meta/info'])
    expect(procedureResponse.status).toBe(200)
    await expect(procedureResponse.json()).resolves.toEqual({
      name: 'SociLab',
      version: '0.1.0',
    })
  })

  test('提供 OpenAPI 3.1 文档端点且仅暴露 GET 方法', async () => {
    const app = createApp()
    const specResponse = await request(app, '/api/openapi/spec.json')
    const docsResponse = await request(app, '/api/openapi/docs')
    const spec = await specResponse.json() as {
      openapi: string
      paths: Record<string, Record<string, unknown>>
    }

    expect(specResponse.status).toBe(200)
    expect(spec.openapi).toBe('3.1.1')
    expect(Object.keys(spec.paths['/meta/info'] ?? {})).toEqual(['get'])
    expect(docsResponse.status).toBe(200)
    await expect(docsResponse.text()).resolves.toContain('SociLab API')
  })

  test('未匹配的 RPC 和 OpenAPI 路径保持标准 404', async () => {
    const app = createApp()
    const rpcResponse = await request(app, '/api/rpc/unknown')
    const openApiResponse = await request(app, '/api/openapi/unknown')

    expect(rpcResponse.status).toBe(404)
    expect(openApiResponse.status).toBe(404)
  })

  test('仅为已配置 Origin 写入 CORS 响应头', async () => {
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

  test('仅接受已配置 Origin 的 CORS 预检请求', async () => {
    const app = createApp({ corsOrigins: ['https://console.socilab.test'] })
    const init = {
      headers: {
        'access-control-request-headers': 'Content-Type',
        'access-control-request-method': 'GET',
      },
      method: 'OPTIONS',
    }
    const allowed = await request(app, '/api/rpc/meta/info', {
      ...init,
      headers: { ...init.headers, origin: 'https://console.socilab.test' },
    })
    const rejected = await request(app, '/api/rpc/meta/info', {
      ...init,
      headers: { ...init.headers, origin: 'https://untrusted.example.test' },
    })

    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://console.socilab.test')
    expect(allowed.headers.get('access-control-allow-methods')).toContain('GET')
    expect(allowed.headers.get('access-control-allow-headers')).toBe('Content-Type')
    expect(rejected.status).toBe(204)
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('将无效 RPC 输入映射为可供调用方处理的校验错误', async () => {
    const response = await request(createApp(), '/api/rpc/meta/info?data=%7B%22json%22%3A%22unexpected%22%7D')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      json: {
        message: 'Input validation failed',
        code: 'BAD_REQUEST',
        data: {
          issues: [
            expect.objectContaining({
              code: expect.any(String),
              message: expect.any(String),
              path: expect.any(String),
            }),
          ],
        },
      },
    })
  })

  test('拒绝 RPC 和 OpenAPI 入口的额外对象字段', async () => {
    const app = createApp()
    const rpcInput = encodeURIComponent(JSON.stringify({ json: { unexpected: true } }))
    const rpcResponse = await request(
      app,
      `/api/rpc/meta/info?data=${rpcInput}`,
    )
    const openApiResponse = await request(app, '/api/openapi/meta/info?unexpected=true')

    expect(rpcResponse.status).toBe(400)
    await expect(rpcResponse.json()).resolves.toMatchObject({
      json: {
        code: 'BAD_REQUEST',
        data: { issues: expect.any(Array) },
      },
    })
    expect(openApiResponse.status).toBe(400)
    await expect(openApiResponse.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      data: { issues: expect.any(Array) },
    })
  })

  test('将 meta.info 的应用错误转换为公共错误结构', async () => {
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
      json: {
        message: '服务信息冲突',
        code: 'CONFLICT',
        data: {
          businessCode: 'META_CONFLICT',
          details: { field: 'version' },
        },
      },
    })
  })

  test('隐藏 meta.info 未知异常的内部细节', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => {
          throw new Error('database password: should-not-leak')
        },
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      json: {
        message: '服务器内部错误',
        code: 'INTERNAL_SERVER_ERROR',
      },
    })
  })

  test('隐藏 meta.info 输出校验失败的内部细节', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => ({ name: 'SociLab', version: 'secret-output-version' }) as never,
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      json: {
        message: '服务器内部错误',
        code: 'INTERNAL_SERVER_ERROR',
      },
    })
  })

  test('隐藏 meta.info 抛出的内部 oRPC 异常细节', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'secret internal oRPC failure',
          })
        },
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      json: {
        message: '服务器内部错误',
        code: 'INTERNAL_SERVER_ERROR',
      },
    })
  })
})
