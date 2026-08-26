import type { HttpError } from '@socilab/request'
import { createRequest } from '@socilab/request'
import { describe, expect, test } from 'vitest'

describe('create request', () => {
  test('removes a trailing base URL slash while preserving the successful Response', async () => {
    let receivedUrl = ''
    const response = new Response('{"ok":true}', { status: 200 })
    const request = createRequest({
      baseUrl: 'https://api.example.test/root/',
      system: 'socilab-test',
      fetch: (input) => {
        receivedUrl = new Request(input).url
        return Promise.resolve(response)
      },
    })

    const result = await request.fetch('/meta/info')

    expect(request.baseUrl).toBe('https://api.example.test/root')
    expect(receivedUrl).toBe('https://api.example.test/root/meta/info')
    expect(result).toBe(response)
  })

  test('keeps absolute URLs and call-site RequestInit semantics', async () => {
    const controller = new AbortController()
    let received: Request | undefined
    const request = createRequest({
      baseUrl: 'https://api.example.test/root',
      system: 'socilab-test',
      fetch: (input, init) => {
        received = new Request(input, init)
        return Promise.resolve(Response.json({ ok: true }))
      },
    })

    await request.fetch('https://external.example.test/items?scope=shared', {
      body: JSON.stringify({ enabled: true }),
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
      method: 'POST',
      signal: controller.signal,
    })

    expect(received?.url).toBe('https://external.example.test/items?scope=shared')
    expect(received?.method).toBe('POST')
    expect(received?.headers.get('content-type')).toBe('application/json')
    expect(received?.headers.get('x-request-id')).toBe('request-1')
    await expect(received?.text()).resolves.toBe('{"enabled":true}')
    expect(received?.signal.aborted).toBe(false)
    controller.abort()
    expect(received?.signal.aborted).toBe(true)
  })

  test('normalizes a JSON error response into an HttpError with business context', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      system: 'socilab-test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        message: '输入无效',
        code: 'INVALID_INPUT',
        details: {
          field: 'email',
        },
        issues: [{ code: 'invalid_format', message: '格式错误', path: 'email' }],
      }), { status: 422 })),
    })

    await expect(request.fetch('/users')).rejects.toMatchObject({
      name: 'HttpError',
      status: 422,
      message: '输入无效',
      code: 'INVALID_INPUT',
      details: {
        field: 'email',
      },
      issues: [{ code: 'invalid_format', message: '格式错误', path: 'email' }],
    } satisfies Partial<HttpError>)
  })

  test('读取标准顶层校验问题', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      system: 'socilab-test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        message: '输入无效',
        issues: [{ code: 'legacy', message: '旧格式错误', path: 'name' }],
      }), { status: 400 })),
    })

    await expect(request.fetch('/legacy')).rejects.toMatchObject({
      issues: [{ code: 'legacy', message: '旧格式错误', path: 'name' }],
    } satisfies Partial<HttpError>)
  })

  test('uses non-JSON response text as a readable HttpError message', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      system: 'socilab-test',
      fetch: () => Promise.resolve(new Response('upstream unavailable', { status: 503 })),
    })

    await expect(request.fetch('/health')).rejects.toMatchObject({
      name: 'HttpError',
      status: 503,
      message: 'upstream unavailable',
    } satisfies Partial<HttpError>)
  })

  test('uses an HTTP status fallback for empty, empty-object, and malformed error bodies', async () => {
    const bodies = ['', '{}', '{invalid']

    for (const body of bodies) {
      const request = createRequest({
        baseUrl: 'https://api.example.test',
        system: 'socilab-test',
        fetch: () => Promise.resolve(new Response(body, { status: 502 })),
      })

      await expect(request.fetch('/health')).rejects.toMatchObject({
        name: 'HttpError',
        status: 502,
        message: 'HTTP 502',
      } satisfies Partial<HttpError>)
    }
  })

  test('为协议适配器保留非成功响应并标记标准错误来源', async () => {
    const response = Response.json({ message: '失败' }, { status: 503 })
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      system: 'socilab-test',
      fetch: () => Promise.resolve(response),
    })

    await expect(request.rawFetch('/meta/info')).resolves.toBe(response)
    await expect(request.fetch('/meta/info')).rejects.toMatchObject({
      name: 'HttpError',
      system: 'socilab-test',
      status: 503,
    })
  })

  test('派生地址时保留动态 Header 且调用点拥有最终覆盖权', async () => {
    let received: Request | undefined
    let token = 'first'
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      system: 'socilab-test',
      headers: () => ({ 'authorization': `Bearer ${token}`, 'x-source': 'default' }),
      fetch: (input, init) => {
        received = new Request(input, init)
        return Promise.resolve(Response.json({ ok: true }))
      },
    }).withBaseUrl('https://api.example.test/api/rpc')

    token = 'second'
    await request.rawFetch('/meta/info', { headers: { 'x-source': 'call' } })

    expect(request.system).toBe('socilab-test')
    expect(received?.url).toBe('https://api.example.test/api/rpc/meta/info')
    expect(received?.headers.get('authorization')).toBe('Bearer second')
    expect(received?.headers.get('x-source')).toBe('call')
  })
})
