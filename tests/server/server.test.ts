import { ORPCError } from '@orpc/server'
import { ApiError } from '@socilab/api'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../projects/server/src/app/define'
import { normalizeProtocolResponse } from '../../projects/server/src/app/orpc'

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

  it('在 OpenAPI 入口只公开 meta.info 契约并可实际调用', async () => {
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

  it('提供 OpenAPI 3.1 文档端点且仅暴露 GET 方法', async () => {
    const app = createApp()
    const specResponse = await request(app, '/api/openapi/spec.json')
    const docsResponse = await request(app, '/api/openapi/docs')
    const spec = await specResponse.json() as {
      openapi: string
      paths: Record<string, Record<string, unknown>>
    }
    const methods = listOpenApiMethods(spec.paths)

    expect(specResponse.status).toBe(200)
    expect(spec.openapi).toBe('3.1.1')
    expect(methods).toEqual(['GET /meta/info'])
    expect(docsResponse.status).toBe(200)
    await expect(docsResponse.text()).resolves.toContain('SociLab API')
  })

  it('方法扫描覆盖全部 OpenAPI 标准操作键并忽略 Path Item 元数据', () => {
    const paths = {
      '/fixture': {
        get: {},
        put: {},
        post: {},
        delete: {},
        options: {},
        head: {},
        patch: {},
        trace: {},
        parameters: [],
      },
    }

    expect(listOpenApiMethods(paths)).toEqual([
      'GET /fixture',
      'PUT /fixture',
      'POST /fixture',
      'DELETE /fixture',
      'OPTIONS /fixture',
      'HEAD /fixture',
      'PATCH /fixture',
      'TRACE /fixture',
    ])
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

  it('仅接受已配置 Origin 的 CORS 预检请求', async () => {
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

  it('拒绝 RPC 和 OpenAPI 入口的额外对象字段', async () => {
    const app = createApp()
    const rpcInput = encodeURIComponent(JSON.stringify({ json: { unexpected: true } }))
    const rpcResponse = await request(
      app,
      `/api/rpc/meta/info?data=${rpcInput}`,
    )
    const openApiResponse = await request(app, '/api/openapi/meta/info?unexpected=true')

    expect(rpcResponse.status).toBe(400)
    await expect(rpcResponse.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      details: { issues: expect.any(Array) },
    })
    expect(openApiResponse.status).toBe(400)
    await expect(openApiResponse.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      details: { issues: expect.any(Array) },
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

  it('隐藏 meta.info 输出校验失败的内部细节', async () => {
    const response = await request(createApp({
      meta: {
        getInfo: () => ({ name: 'SociLab', version: 'secret-output-version' }) as never,
      },
    }), '/api/rpc/meta/info')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      message: '服务器内部错误',
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('隐藏 meta.info 抛出的内部 oRPC 异常细节', async () => {
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
    await expect(response.json()).resolves.toEqual({
      message: '服务器内部错误',
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('保留 3xx 和 304 协议响应而不重写其实体', async () => {
    const redirect = new Response('redirect payload', {
      headers: { location: '/next' },
      status: 302,
    })
    const notModified = new Response(null, {
      headers: { etag: '"unchanged"' },
      status: 304,
    })
    const normalizedRedirect = await normalizeProtocolResponse(redirect)
    const normalizedNotModified = await normalizeProtocolResponse(notModified)

    expect(normalizedRedirect).toBe(redirect)
    expect(normalizedRedirect.headers.get('location')).toBe('/next')
    await expect(normalizedRedirect.text()).resolves.toBe('redirect payload')
    expect(normalizedNotModified).toBe(notModified)
    expect(normalizedNotModified.headers.get('etag')).toBe('"unchanged"')
  })

  it('重建错误响应时清理过期实体 headers 并保留 CORS 与重试语义', async () => {
    const response = new Response(JSON.stringify({
      json: {
        code: 'BAD_REQUEST',
        data: { issues: [] },
        message: 'Input validation failed',
      },
    }), {
      headers: {
        'access-control-allow-origin': 'https://console.socilab.test',
        'content-encoding': 'gzip',
        'content-length': '999',
        'content-type': 'application/json',
        'etag': '"old-entity"',
        'retry-after': '60',
      },
      status: 400,
    })
    const normalized = await normalizeProtocolResponse(response)

    expect(normalized.headers.get('access-control-allow-origin')).toBe('https://console.socilab.test')
    expect(normalized.headers.get('retry-after')).toBe('60')
    expect(normalized.headers.get('content-encoding')).toBeNull()
    expect(normalized.headers.get('content-length')).toBeNull()
    expect(normalized.headers.get('etag')).toBeNull()
    await expect(normalized.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      details: { issues: [] },
      message: 'Input validation failed',
    })
  })
})

/** 列出 OpenAPI 文档中公开的标准 HTTP 操作 */
function listOpenApiMethods(paths: Record<string, object | undefined>) {
  return Object.entries(paths).flatMap(([path, item]) => (
    Object.keys(item ?? {})
      .filter(method => ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'].includes(method))
      .map(method => `${method.toUpperCase()} ${path}`)
  ))
}
