import { z } from 'zod'
import {
  createBooleanEnvironmentSchema,
  environmentSecretSchema,
  environmentStringSchema,
  hasEnvironmentValue,
  optionalEnvironmentStringSchema,
} from './environment.js'

/** -------------------- 类型 -------------------- */
/** 阿里云 OSS 连接配置 */
export interface OssConfig {
  /** AccessKey ID */
  accessKeyId: string
  /** AccessKey Secret */
  accessKeySecret: string
  /** OSS region */
  region: string
  /** 可选的公网、内网或自定义 endpoint */
  endpoint?: string
  /** 是否使用 HTTPS */
  secure: boolean
  /** 已开启公共读的公共存储桶 */
  publicBucket: string
  /** 只允许授权访问的私有存储桶 */
  privateBucket: string
}

/** -------------------- 常量 -------------------- */
/** OSS 配置组环境变量 */
const ossEnvironmentKeys = [
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
  'OSS_REGION',
  'OSS_ENDPOINT',
  'OSS_SECURE',
  'OSS_BUCKET_PUBLIC',
  'OSS_BUCKET_PRIVATE',
] as const

/** -------------------- Schema -------------------- */
/** OSS 环境变量边界 */
const ossEnvironmentSchema = z.object({
  OSS_ACCESS_KEY_ID: environmentStringSchema,
  OSS_ACCESS_KEY_SECRET: environmentSecretSchema,
  OSS_BUCKET_PRIVATE: environmentStringSchema,
  OSS_BUCKET_PUBLIC: environmentStringSchema,
  OSS_ENDPOINT: optionalEnvironmentStringSchema,
  OSS_REGION: environmentStringSchema,
  OSS_SECURE: createBooleanEnvironmentSchema(true),
}).transform(environment => ({
  accessKeyId: environment.OSS_ACCESS_KEY_ID,
  accessKeySecret: environment.OSS_ACCESS_KEY_SECRET,
  endpoint: environment.OSS_ENDPOINT,
  privateBucket: environment.OSS_BUCKET_PRIVATE,
  publicBucket: environment.OSS_BUCKET_PUBLIC,
  region: environment.OSS_REGION,
  secure: environment.OSS_SECURE,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的阿里云 OSS 配置
 */
export function loadOssConfig(environment: NodeJS.ProcessEnv): OssConfig | undefined {
  if (!hasEnvironmentValue(environment, ossEnvironmentKeys))
    return

  return ossEnvironmentSchema.parse(environment)
}
