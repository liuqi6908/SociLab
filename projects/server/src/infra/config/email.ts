import { z } from 'zod'
import {
  createBooleanEnvironmentSchema,
  createIntegerEnvironmentSchema,
  environmentSecretSchema,
  environmentStringSchema,
  hasEnvironmentValue,
} from './environment.js'

/** -------------------- 类型 -------------------- */
/** SMTP 邮件连接配置 */
export interface EmailConfig {
  /** SMTP 主机 */
  host: string
  /** SMTP 端口 */
  port: number
  /** 发件邮箱用户 */
  user: string
  /** 飞书邮箱客户端专用密码 */
  password: string
  /** 是否建立安全连接 */
  secure: boolean
  /** 每秒允许发送的邮件数量 */
  rateLimitPerSecond: number
}

/** -------------------- 常量 -------------------- */
/** 邮件配置组环境变量 */
const emailEnvironmentKeys = [
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'EMAIL_SECURE',
  'EMAIL_RATE_LIMIT_PER_SECOND',
] as const

/** -------------------- Schema -------------------- */
/** SMTP 环境变量边界 */
const emailEnvironmentSchema = z.object({
  EMAIL_HOST: environmentStringSchema,
  EMAIL_PASSWORD: environmentSecretSchema,
  EMAIL_PORT: createIntegerEnvironmentSchema(465, 1, 65_535),
  EMAIL_RATE_LIMIT_PER_SECOND: createIntegerEnvironmentSchema(2, 1, 10_000),
  EMAIL_SECURE: createBooleanEnvironmentSchema(true),
  EMAIL_USER: environmentStringSchema,
}).transform(environment => ({
  host: environment.EMAIL_HOST,
  password: environment.EMAIL_PASSWORD,
  port: environment.EMAIL_PORT,
  rateLimitPerSecond: environment.EMAIL_RATE_LIMIT_PER_SECOND,
  secure: environment.EMAIL_SECURE,
  user: environment.EMAIL_USER,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的 SMTP 邮件配置
 */
export function loadEmailConfig(environment: NodeJS.ProcessEnv): EmailConfig | undefined {
  if (!hasEnvironmentValue(environment, emailEnvironmentKeys))
    return

  return emailEnvironmentSchema.parse(environment)
}
