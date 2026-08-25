import { isPlainRecord, jsonParse } from '@socilab/shared'
import { describe, expect, it } from 'vitest'

describe('shared utils', () => {
  it('解析合法 JSON 并在语法错误时返回 undefined', () => {
    expect(jsonParse('{"name":"SociLab","enabled":true}')).toEqual({
      name: 'SociLab',
      enabled: true,
    })
    expect(jsonParse('null')).toBeNull()
    expect(jsonParse('{invalid')).toBeUndefined()
  })

  it('仅接受 Object 或 null 原型的普通记录', () => {
    class Example {}

    const nullPrototype = Object.create(null) as Record<string, unknown>

    nullPrototype.name = 'SociLab'

    expect(isPlainRecord({})).toBe(true)
    expect(isPlainRecord(nullPrototype)).toBe(true)
    expect(isPlainRecord([])).toBe(false)
    expect(isPlainRecord(new Date(0))).toBe(false)
    expect(isPlainRecord(new Example())).toBe(false)
    expect(isPlainRecord(null)).toBe(false)
  })
})
