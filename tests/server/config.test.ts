// cspell:words aliyuncs
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { loadServerConfig } from '../../projects/server/src/infra/config'

describe('server environment config', () => {
  it('在未配置未来服务时只启用默认网络配置', () => {
    expect(loadServerConfig({})).toEqual({
      captcha: undefined,
      database: undefined,
      email: undefined,
      oss: undefined,
      redis: undefined,
      server: {
        corsOrigins: [],
        host: '127.0.0.1',
        port: 4317,
      },
      sms: undefined,
    })
  })

  it('复制服务端环境示例时不会误启用未来服务', () => {
    const source = readFileSync(
      new URL('../../projects/server/.env.example', import.meta.url),
      'utf8',
    )

    expect(loadServerConfig(parseEnv(source))).toEqual({
      captcha: undefined,
      database: undefined,
      email: undefined,
      oss: undefined,
      redis: undefined,
      server: {
        corsOrigins: ['http://localhost:4318', 'http://localhost:4319'],
        host: '127.0.0.1',
        port: 4317,
      },
      sms: undefined,
    })
  })

  it('解析网络覆盖值并拒绝非法端口', () => {
    expect(loadServerConfig({
      CORS_ORIGINS: ' https://client.example.test, ,https://admin.example.test ',
      SERVER_HOST: ' 0.0.0.0 ',
      SERVER_PORT: '65535',
    }).server).toEqual({
      corsOrigins: ['https://client.example.test', 'https://admin.example.test'],
      host: '0.0.0.0',
      port: 65_535,
    })

    for (const port of ['0', '65536', '1.5', 'invalid'])
      expect(() => loadServerConfig({ SERVER_PORT: port })).toThrow()
  })

  it('忽略全部为空白的未来服务配置', () => {
    const config = loadServerConfig({
      CAPTCHA_SITE_KEY: ' ',
      DATABASE_USER: '',
      EMAIL_HOST: ' ',
      OSS_REGION: '',
      REDIS_HOST: ' ',
      SMS_SIGN_NAME: '',
    })

    expect(config).toMatchObject({
      captcha: undefined,
      database: undefined,
      email: undefined,
      oss: undefined,
      redis: undefined,
      sms: undefined,
    })
  })

  it('使用默认连接参数解析完整 PostgreSQL 配置', () => {
    expect(loadServerConfig({
      DATABASE_NAME: 'socilab',
      DATABASE_PASSWORD: 'database-secret',
      DATABASE_USER: 'socilab',
    }).database).toEqual({
      host: 'localhost',
      name: 'socilab',
      password: 'database-secret',
      port: 5432,
      user: 'socilab',
    })
  })

  it('拒绝不完整或非法的 PostgreSQL 配置', () => {
    expect(() => loadServerConfig({ DATABASE_USER: 'socilab' })).toThrow()
    expect(() => loadServerConfig({
      DATABASE_NAME: 'socilab',
      DATABASE_PASSWORD: 'database-secret',
      DATABASE_PORT: '0',
      DATABASE_USER: 'socilab',
    })).toThrow()
  })

  it('只用 Redis 配置描述共享服务连接，不接受业务 DB 分配', () => {
    expect(loadServerConfig({
      REDIS_HOST: ' redis.internal ',
      REDIS_PASSWORD: 'redis-secret',
      REDIS_PORT: '6380',
      REDIS_USER: 'socilab',
    }).redis).toEqual({
      host: 'redis.internal',
      password: 'redis-secret',
      port: 6380,
      user: 'socilab',
    })

    expect(loadServerConfig({ REDIS_DB: '15' }).redis).toBeUndefined()
  })

  it('解析阿里云 OSS 双存储桶配置', () => {
    expect(loadServerConfig({
      OSS_ACCESS_KEY_ID: 'oss-access-key',
      OSS_ACCESS_KEY_SECRET: 'oss-secret-key',
      OSS_BUCKET_PRIVATE: 'socilab-private',
      OSS_BUCKET_PUBLIC: 'socilab-public',
      OSS_ENDPOINT: 'oss-cn-hangzhou-internal.aliyuncs.com',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_SECURE: 'false',
    }).oss).toEqual({
      accessKeyId: 'oss-access-key',
      accessKeySecret: 'oss-secret-key',
      endpoint: 'oss-cn-hangzhou-internal.aliyuncs.com',
      privateBucket: 'socilab-private',
      publicBucket: 'socilab-public',
      region: 'oss-cn-hangzhou',
      secure: false,
    })
  })

  it('拒绝不完整或非法的 OSS 配置', () => {
    expect(() => loadServerConfig({ OSS_REGION: 'oss-cn-hangzhou' })).toThrow()
    expect(() => loadServerConfig({
      OSS_ACCESS_KEY_ID: 'oss-access-key',
      OSS_ACCESS_KEY_SECRET: 'oss-secret-key',
      OSS_BUCKET_PRIVATE: 'socilab-private',
      OSS_BUCKET_PUBLIC: 'socilab-public',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_SECURE: 'sometimes',
    })).toThrow()
  })

  it('解析阿里云短信配置', () => {
    expect(loadServerConfig({
      SMS_ACCESS_KEY_ID: 'sms-access-key',
      SMS_ACCESS_KEY_SECRET: 'sms-secret-key',
      SMS_CODE_TEMPLATE_CODE: 'SMS_123456789',
      SMS_SIGN_NAME: 'SociLab',
    }).sms).toEqual({
      accessKeyId: 'sms-access-key',
      accessKeySecret: 'sms-secret-key',
      codeTemplateCode: 'SMS_123456789',
      region: 'cn-hangzhou',
      signName: 'SociLab',
    })
  })

  it('拒绝不完整的短信配置', () => {
    expect(() => loadServerConfig({ SMS_SIGN_NAME: 'SociLab' })).toThrow()
  })

  it('解析飞书邮箱 SMTP 配置', () => {
    expect(loadServerConfig({
      EMAIL_HOST: 'smtp.example.test',
      EMAIL_PASSWORD: 'smtp-client-password',
      EMAIL_RATE_LIMIT_PER_SECOND: '4',
      EMAIL_SECURE: 'false',
      EMAIL_USER: 'noreply@example.test',
    }).email).toEqual({
      host: 'smtp.example.test',
      password: 'smtp-client-password',
      port: 465,
      rateLimitPerSecond: 4,
      secure: false,
      user: 'noreply@example.test',
    })
  })

  it('拒绝不完整或非法的邮件配置', () => {
    expect(() => loadServerConfig({ EMAIL_USER: 'noreply@example.test' })).toThrow()
    expect(() => loadServerConfig({
      EMAIL_HOST: 'smtp.example.test',
      EMAIL_PASSWORD: 'smtp-client-password',
      EMAIL_RATE_LIMIT_PER_SECOND: '0',
      EMAIL_USER: 'noreply@example.test',
    })).toThrow()
  })

  it('解析并规范化 Cap 服务地址', () => {
    expect(loadServerConfig({
      CAPTCHA_CLIENT_ENDPOINT: 'https://captcha.example.test/',
      CAPTCHA_SECRET_KEY: 'captcha-secret',
      CAPTCHA_SERVER_ENDPOINT: 'http://captcha.internal:3000/',
      CAPTCHA_SITE_KEY: 'captcha-site',
    }).captcha).toEqual({
      clientEndpoint: 'https://captcha.example.test',
      secretKey: 'captcha-secret',
      serverEndpoint: 'http://captcha.internal:3000',
      siteKey: 'captcha-site',
    })
  })

  it('拒绝不完整或非 HTTP 协议的 Cap 配置', () => {
    expect(() => loadServerConfig({ CAPTCHA_SITE_KEY: 'captcha-site' })).toThrow()
    expect(() => loadServerConfig({
      CAPTCHA_CLIENT_ENDPOINT: 'file:///captcha',
      CAPTCHA_SECRET_KEY: 'captcha-secret',
      CAPTCHA_SERVER_ENDPOINT: 'http://captcha.internal:3000',
      CAPTCHA_SITE_KEY: 'captcha-site',
    })).toThrow()
  })
})
