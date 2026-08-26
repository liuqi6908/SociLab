import { z } from 'zod'
import {
  createIntegerEnvironmentSchema,
  environmentStringSchema,
  hasEnvironmentValue,
  optionalEnvironmentSecretSchema,
  optionalEnvironmentStringSchema,
} from './environment.js'

/** -------------------- 类型 -------------------- */
/** Redis 连接配置 */
export interface RedisConfig {
  /** Redis 主机 */
  host: string
  /** Redis 端口 */
  port: number
  /** Redis 用户 */
  user?: string
  /** Redis 密码 */
  password?: string
}

/** -------------------- 常量 -------------------- */
/** Redis 配置组环境变量 */
const redisEnvironmentKeys = [
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USER',
  'REDIS_PASSWORD',
] as const

/** -------------------- Schema -------------------- */
/** Redis 环境变量边界 */
const redisEnvironmentSchema = z.object({
  REDIS_HOST: environmentStringSchema.default('localhost'),
  REDIS_PASSWORD: optionalEnvironmentSecretSchema,
  REDIS_PORT: createIntegerEnvironmentSchema(6379, 1, 65_535),
  REDIS_USER: optionalEnvironmentStringSchema,
}).transform(environment => ({
  host: environment.REDIS_HOST,
  password: environment.REDIS_PASSWORD,
  port: environment.REDIS_PORT,
  user: environment.REDIS_USER,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的 Redis 配置
 */
export function loadRedisConfig(environment: NodeJS.ProcessEnv): RedisConfig | undefined {
  if (!hasEnvironmentValue(environment, redisEnvironmentKeys))
    return

  return redisEnvironmentSchema.parse(environment)
}
