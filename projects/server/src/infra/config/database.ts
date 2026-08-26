import { z } from 'zod'
import {
  createIntegerEnvironmentSchema,
  environmentSecretSchema,
  environmentStringSchema,
  hasEnvironmentValue,
} from './environment.js'

/** -------------------- 类型 -------------------- */
/** PostgreSQL 连接配置 */
export interface DatabaseConfig {
  /** 数据库主机 */
  host: string
  /** 数据库端口 */
  port: number
  /** 数据库用户 */
  user: string
  /** 数据库密码 */
  password: string
  /** 数据库名称 */
  name: string
}

/** -------------------- 常量 -------------------- */
/** PostgreSQL 配置组环境变量 */
const databaseEnvironmentKeys = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
] as const

/** -------------------- Schema -------------------- */
/** PostgreSQL 环境变量边界 */
const databaseEnvironmentSchema = z.object({
  DATABASE_HOST: environmentStringSchema.default('localhost'),
  DATABASE_NAME: environmentStringSchema,
  DATABASE_PASSWORD: environmentSecretSchema,
  DATABASE_PORT: createIntegerEnvironmentSchema(5432, 1, 65_535),
  DATABASE_USER: environmentStringSchema,
}).transform(environment => ({
  host: environment.DATABASE_HOST,
  name: environment.DATABASE_NAME,
  password: environment.DATABASE_PASSWORD,
  port: environment.DATABASE_PORT,
  user: environment.DATABASE_USER,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的 PostgreSQL 配置
 */
export function loadDatabaseConfig(
  environment: NodeJS.ProcessEnv,
): DatabaseConfig | undefined {
  if (!hasEnvironmentValue(environment, databaseEnvironmentKeys))
    return

  return databaseEnvironmentSchema.parse(environment)
}
