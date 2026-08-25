import { OpenAPIGenerator } from '@orpc/openapi'
import { API_BASE_PATH, API_RPC_PATH, apiContract, ApiError, metaInfoSchema } from '@socilab/api'
import { describe, expect, it } from 'vitest'

describe('api contract', () => {
  it('rejects an invalid service version while exposing the same OpenAPI output shape', async () => {
    expect(metaInfoSchema.safeParse({ name: 'SociLab', version: '0.1.1' }).success).toBe(false)
    expect(metaInfoSchema.parse({ name: 'SociLab', version: '0.1.0' })).toEqual({
      name: 'SociLab',
      version: '0.1.0',
    })

    const document = await new OpenAPIGenerator().generate(apiContract, {
      info: { title: 'SociLab', version: '0.1.0' },
    })

    expect(document.paths?.['/meta/info']?.get?.responses['200']).toBeDefined()
    expect(API_BASE_PATH).toBe('/api')
    expect(API_RPC_PATH).toBe('/api/rpc')
  })

  it('preserves status and structured details across HTTP boundaries', () => {
    const error = new ApiError(409, '名称已存在', {
      code: 'NAME_CONFLICT',
      details: { field: 'name' },
    })

    expect(error).toMatchObject({
      name: 'ApiError',
      status: 409,
      message: '名称已存在',
      code: 'NAME_CONFLICT',
      details: { field: 'name' },
    })
  })
})
