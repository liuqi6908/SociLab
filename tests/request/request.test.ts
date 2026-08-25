import type { HttpError } from '@socilab/request'
import { createRequest } from '@socilab/request'
import { describe, expect, it } from 'vitest'

describe('create request', () => {
  it('removes a trailing base URL slash while preserving the successful Response', async () => {
    let receivedUrl = ''
    const response = new Response('{"ok":true}', { status: 200 })
    const request = createRequest({
      baseUrl: 'https://api.example.test/root/',
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

  it('normalizes a JSON error response into an HttpError with business context', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        message: '输入无效',
        code: 'INVALID_INPUT',
        details: {
          field: 'email',
          issues: [{ code: 'invalid_format', message: '格式错误', path: 'email' }],
        },
      }), { status: 422 })),
    })

    await expect(request.fetch('/users')).rejects.toMatchObject({
      name: 'HttpError',
      status: 422,
      message: '输入无效',
      code: 'INVALID_INPUT',
      details: {
        field: 'email',
        issues: [{ code: 'invalid_format', message: '格式错误', path: 'email' }],
      },
      issues: [{ code: 'invalid_format', message: '格式错误', path: 'email' }],
    } satisfies Partial<HttpError>)
  })

  it('continues to accept legacy top-level validation issues', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        message: '输入无效',
        issues: [{ code: 'legacy', message: '旧格式错误', path: 'name' }],
      }), { status: 400 })),
    })

    await expect(request.fetch('/legacy')).rejects.toMatchObject({
      issues: [{ code: 'legacy', message: '旧格式错误', path: 'name' }],
    } satisfies Partial<HttpError>)
  })

  it('uses non-JSON response text as a readable HttpError message', async () => {
    const request = createRequest({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response('upstream unavailable', { status: 503 })),
    })

    await expect(request.fetch('/health')).rejects.toMatchObject({
      name: 'HttpError',
      status: 503,
      message: 'upstream unavailable',
    } satisfies Partial<HttpError>)
  })

  it('uses an HTTP status fallback for empty, empty-object, and malformed error bodies', async () => {
    const bodies = ['', '{}', '{invalid']

    for (const body of bodies) {
      const request = createRequest({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(new Response(body, { status: 502 })),
      })

      await expect(request.fetch('/health')).rejects.toMatchObject({
        name: 'HttpError',
        status: 502,
        message: 'HTTP 502',
      } satisfies Partial<HttpError>)
    }
  })
})
