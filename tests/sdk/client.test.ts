import type { Context } from 'hono'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { API_RPC_PATH, apiContract } from '@socilab/api'
import { Client } from '@socilab/sdk'
import { createApiQueryUtils } from '@socilab/sdk/query'
import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from '../../projects/server/src/app/define'

describe('sdk client', () => {
  test('并发 procedure 通过同一个原生 batch 请求执行', async () => {
    const app = createApp()
    const requestUrls: string[] = []
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)

      requestUrls.push(request.url)
      return Promise.resolve(app.fetch(request))
    })
    const client = Client.create({ baseUrl: 'https://sdk.example.test', fetch })

    await expect(Promise.all([
      client.rpc.meta.info(),
      client.rpc.meta.info(),
    ])).resolves.toEqual([
      { name: 'SociLab', version: '0.1.0' },
      { name: 'SociLab', version: '0.1.0' },
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requestUrls[0]).toContain('/__batch__')
  })

  test('calls the typed service-info contract through an in-memory Hono oRPC boundary', async () => {
    const implementation = implement(apiContract)
    const router = implementation.router({
      meta: {
        info: implementation.meta.info.handler(() => ({ name: 'SociLab', version: '0.1.0' })),
      },
    })
    const rpcHandler = new RPCHandler(router)
    const app = new Hono()

    const handleRpc = async (context: Context) => {
      const request = context.req.raw
      const url = new URL(request.url)
      url.pathname = context.req.path.slice(API_RPC_PATH.length) || '/'
      const result = await rpcHandler.handle(new Request(url, {
        headers: request.headers,
        method: request.method,
        signal: request.signal,
      }))
      return result.response ?? context.notFound()
    }

    app.all('/api/rpc', handleRpc)
    app.all('/api/rpc/*', handleRpc)

    const client = Client.create({
      baseUrl: 'https://sdk.example.test/',
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    })

    await expect(client.rpc.meta.info()).resolves.toEqual({ name: 'SociLab', version: '0.1.0' })
    expect(createApiQueryUtils(client).meta.info.queryKey()).toEqual([
      ['https://sdk.example.test', 'meta', 'info'],
      { type: 'query' },
    ])
  })

  test('preserves createApp validation issues through the SDK request boundary', async () => {
    const app = createApp()
    const client = Client.create({
      baseUrl: 'https://sdk.example.test',
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    })
    await expect(client.rpc.meta.info({ unexpected: true } as never)).rejects.toMatchObject({
      status: 400,
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
    })
  })

  test('isolates query keys by base URL and keeps query utility keys consistent', () => {
    const first = createApiQueryUtils(Client.create({ baseUrl: 'https://first.example.test/' }))
    const second = createApiQueryUtils(Client.create({ baseUrl: 'https://second.example.test/' }))
    const firstKey = first.meta.info.queryKey()
    const secondKey = second.meta.info.queryKey()

    expect(firstKey).toEqual([
      ['https://first.example.test', 'meta', 'info'],
      { type: 'query' },
    ])
    expect(secondKey).toEqual([
      ['https://second.example.test', 'meta', 'info'],
      { type: 'query' },
    ])
    expect(firstKey).not.toEqual(secondKey)
    expect(first.meta.info.key({ type: 'query' })).toEqual(firstKey)
  })

  test('forwards AbortSignal through the typed oRPC transport', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const client = Client.create({
      baseUrl: 'https://sdk.example.test',
      fetch: (input, init) => {
        receivedSignal = new Request(input, init).signal
        return Promise.resolve(createInfoResponse())
      },
    })

    await client.rpc.meta.info(undefined, { signal: controller.signal })

    expect(receivedSignal?.aborted).toBe(false)
    controller.abort()
    expect(receivedSignal?.aborted).toBe(true)
  })
})

/** -------------------- 测试工具 -------------------- */
/** 创建符合 oRPC envelope 的服务信息响应 */
function createInfoResponse() {
  return Response.json({
    json: {
      name: 'SociLab',
      version: '0.1.0',
    },
  })
}
