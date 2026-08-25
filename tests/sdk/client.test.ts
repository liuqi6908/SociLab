import type { Context } from 'hono'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { API_RPC_PATH, apiContract } from '@socilab/api'
import { Client } from '@socilab/sdk'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../projects/server/src/app'

describe('sdk client', () => {
  it('calls the typed service-info contract through an in-memory Hono oRPC boundary', async () => {
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
    expect(client.createApiQueryUtils().meta.info.queryKey()).toEqual([
      ['https://sdk.example.test', 'meta', 'info'],
      { type: 'query' },
    ])
  })

  it('preserves createApp validation issues through the SDK request boundary', async () => {
    const app = createApp()
    const client = Client.create({
      baseUrl: 'https://sdk.example.test',
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    })
    const callWithUnexpectedInput = client.rpc.meta.info as (
      input: { unexpected: boolean },
    ) => Promise<unknown>

    await expect(callWithUnexpectedInput({ unexpected: true })).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
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
      issues: [
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
          path: expect.any(String),
        }),
      ],
    })
  })
})
