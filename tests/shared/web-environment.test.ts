import { loadWebEnvironment } from '@socilab/shared/node'
import { describe, expect, it } from 'vitest'

describe('web environment', () => {
  it('在没有覆盖值时返回应用默认运行配置', () => {
    expect(loadWebEnvironment({
      defaultPort: 4318,
      environment: {},
      prefix: 'CLIENT',
    })).toEqual({
      apiProxyTarget: 'http://127.0.0.1:4317',
      basePath: '/',
      host: '0.0.0.0',
      port: 4318,
    })
  })

  it('只读取指定应用前缀并规范化覆盖值', () => {
    expect(loadWebEnvironment({
      defaultPort: 4318,
      environment: {
        ADMIN_PORT: '4999',
        CLIENT_API_PROXY_TARGET: ' https://api.example.test/internal/ ',
        CLIENT_BASE_PATH: ' portal ',
        CLIENT_HOST: ' 127.0.0.1 ',
        CLIENT_PORT: '4400',
      },
      prefix: 'CLIENT',
    })).toEqual({
      apiProxyTarget: 'https://api.example.test/internal',
      basePath: '/portal/',
      host: '127.0.0.1',
      port: 4400,
    })
  })

  it('拒绝范围外、非整数或非数字端口', () => {
    for (const port of ['0', '65536', '1.5', 'invalid']) {
      expect(() => loadWebEnvironment({
        defaultPort: 4318,
        environment: { CLIENT_PORT: port },
        prefix: 'CLIENT',
      })).toThrow('CLIENT_PORT')
    }
  })

  it('拒绝不是应用 pathname 的基础路径', () => {
    for (const basePath of ['https://example.test/app', '/app?debug=true', '/../admin']) {
      expect(() => loadWebEnvironment({
        defaultPort: 4318,
        environment: { CLIENT_BASE_PATH: basePath },
        prefix: 'CLIENT',
      })).toThrow('CLIENT_BASE_PATH')
    }
  })

  it('拒绝非 HTTP 协议或包含凭据的代理地址', () => {
    for (const apiProxyTarget of [
      'file:///server',
      'https://user:secret@api.example.test',
      '/api',
    ]) {
      expect(() => loadWebEnvironment({
        defaultPort: 4318,
        environment: { CLIENT_API_PROXY_TARGET: apiProxyTarget },
        prefix: 'CLIENT',
      })).toThrow('CLIENT_API_PROXY_TARGET')
    }
  })
})
