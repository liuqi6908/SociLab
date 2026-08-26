import type { CaptchaConfig } from './captcha.js'
import type { DatabaseConfig } from './database.js'
import type { EmailConfig } from './email.js'
import type { OssConfig } from './oss.js'
import type { RedisConfig } from './redis.js'
import type { HttpServerConfig } from './server.js'
import type { SmsConfig } from './sms.js'
import process from 'node:process'
import { loadCaptchaConfig } from './captcha.js'
import { loadDatabaseConfig } from './database.js'
import { loadEmailConfig } from './email.js'
import { loadOssConfig } from './oss.js'
import { loadRedisConfig } from './redis.js'
import { loadHttpServerConfig } from './server.js'
import { loadSmsConfig } from './sms.js'

/** -------------------- 类型 -------------------- */
/** 服务端完整环境配置 */
export interface ServerConfig {
  /** HTTP 服务网络配置 */
  server: HttpServerConfig
  /** PostgreSQL 连接配置 */
  database?: DatabaseConfig
  /** Redis 连接配置 */
  redis?: RedisConfig
  /** 阿里云 OSS 连接配置 */
  oss?: OssConfig
  /** 阿里云短信连接配置 */
  sms?: SmsConfig
  /** SMTP 邮件连接配置 */
  email?: EmailConfig
  /** 自托管 Cap 验证码配置 */
  captcha?: CaptchaConfig
}

/** -------------------- 核心函数 -------------------- */
/**
 * 从进程环境读取完整服务配置
 */
export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    captcha: loadCaptchaConfig(environment),
    database: loadDatabaseConfig(environment),
    email: loadEmailConfig(environment),
    oss: loadOssConfig(environment),
    redis: loadRedisConfig(environment),
    server: loadHttpServerConfig(environment),
    sms: loadSmsConfig(environment),
  }
}
