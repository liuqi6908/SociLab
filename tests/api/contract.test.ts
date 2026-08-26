import { isContractProcedure } from '@orpc/contract'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { API_BASE_PATH, API_RPC_PATH, apiContract, ApiError, emptyInputSchema, metaInfoSchema } from '@socilab/api'
import { describe, expect, it } from 'vitest'

describe('api contract', () => {
  it('仅公开 meta.info procedure', () => {
    expect(listProcedures(apiContract)).toEqual(['meta.info'])
  })

  it('rejects an invalid service version while exposing the same OpenAPI output shape', async () => {
    expect(metaInfoSchema.safeParse({ name: 'SociLab', version: '0.1.1' }).success).toBe(false)
    expect(metaInfoSchema.parse({ name: 'SociLab', version: '0.1.0' })).toEqual({
      name: 'SociLab',
      version: '0.1.0',
    })

    const document = await new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }).generate(apiContract, {
      info: { title: 'SociLab', version: '0.1.0' },
    })

    expect(document.paths?.['/meta/info']?.get?.responses['200']).toBeDefined()
    expect(API_BASE_PATH).toBe('/api')
    expect(API_RPC_PATH).toBe('/api/rpc')
  })

  it('emits SociLab name and version literals in the OpenAPI response schema', async () => {
    const document = await new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }).generate(apiContract, {
      info: { title: 'SociLab', version: '0.1.0' },
    })
    const response = document.paths?.['/meta/info']?.get?.responses['200']

    expect(response).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              name: { const: 'SociLab' },
              version: { const: '0.1.0' },
            },
            required: ['name', 'version'],
          },
        },
      },
    })
  })

  it('仅为 meta.info 暴露 OpenAPI GET 方法', async () => {
    const document = await new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }).generate(apiContract, {
      info: { title: 'SociLab', version: '0.1.0' },
    })
    const methods = listOpenApiMethods(document.paths ?? {})

    expect(methods).toEqual(['GET /meta/info'])
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

  it('rejects undeclared meta.info input fields in runtime and OpenAPI contracts', async () => {
    expect(emptyInputSchema.safeParse({ unexpected: true }).success).toBe(false)

    const converter = new ZodToJsonSchemaConverter()
    const [, openApiInputSchema] = converter.convert(emptyInputSchema, { strategy: 'input' })
    const document = await new OpenAPIGenerator({
      schemaConverters: [converter],
    }).generate(apiContract, {
      info: { title: 'SociLab', version: '0.1.0' },
    })
    const operation = document.paths?.['/meta/info']?.get

    expect(openApiInputSchema).toMatchObject({
      additionalProperties: false,
      type: 'object',
    })
    expect(operation?.parameters ?? []).toEqual([])
    expect(operation?.requestBody).toBeUndefined()
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

/** -------------------- 内部函数 -------------------- */
/** 递归列出契约中公开的 procedure 路径 */
function listProcedures(router: object, prefix: string[] = []): string[] {
  return Object.entries(router).flatMap(([key, value]) => {
    const path = [...prefix, key]

    if (isContractProcedure(value))
      return [path.join('.')]
    if (typeof value !== 'object' || value === null)
      return []

    return listProcedures(value, path)
  }).sort()
}

/** 列出 OpenAPI 文档中公开的标准 HTTP 操作 */
function listOpenApiMethods(paths: Record<string, object | undefined>) {
  return Object.entries(paths).flatMap(([path, item]) => (
    Object.keys(item ?? {})
      .filter(method => ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'].includes(method))
      .map(method => `${method.toUpperCase()} ${path}`)
  ))
}
