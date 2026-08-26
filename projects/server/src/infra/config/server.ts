import { z } from 'zod'
import { createIntegerEnvironmentSchema, environmentStringSchema } from './environment.js'

/** -------------------- 类型 -------------------- */
/** HTTP 服务网络配置 */
export interface HttpServerConfig {
  /** 监听主机 */
  host: string
  /** 监听端口 */
  port: number
  /** 允许跨域访问 API 的 Origin */
  corsOrigins: string[]
}

/** -------------------- Schema -------------------- */
/** HTTP 服务环境变量边界 */
const httpServerEnvironmentSchema = z.object({
  CORS_ORIGINS: z.string().optional().default(''),
  SERVER_HOST: environmentStringSchema.default('127.0.0.1'),
  SERVER_PORT: createIntegerEnvironmentSchema(4317, 1, 65_535),
}).transform(environment => ({
  corsOrigins: environment.CORS_ORIGINS
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  host: environment.SERVER_HOST,
  port: environment.SERVER_PORT,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取并校验 HTTP 服务网络配置
 */
export function loadHttpServerConfig(environment: NodeJS.ProcessEnv): HttpServerConfig {
  return httpServerEnvironmentSchema.parse(environment)
}
