import { z } from 'zod'

/** -------------------- 类型 -------------------- */
/** 服务端环境变量输入 */
export type ServerEnvironment = NodeJS.ProcessEnv

/** -------------------- Schema -------------------- */
/** 去除首尾空白且不能为空的环境字符串 */
export const environmentStringSchema = z.preprocess(
  normalizeEnvironmentString,
  z.string().min(1),
)
/** 保留原值但拒绝空白内容的敏感环境字符串 */
export const environmentSecretSchema = z.preprocess(
  normalizeEnvironmentSecret,
  z.string().min(1),
)
/** 可选的普通环境字符串 */
export const optionalEnvironmentStringSchema = environmentStringSchema.optional()
/** 可选的敏感环境字符串 */
export const optionalEnvironmentSecretSchema = environmentSecretSchema.optional()
/** 仅允许 HTTP(S) 且移除尾部斜杠的环境地址 */
export const environmentHttpUrlSchema = environmentStringSchema
  .pipe(z.url())
  .refine(isHttpUrl, '必须使用 HTTP 或 HTTPS 协议')
  .transform(value => value.replace(/\/+$/, ''))

/** -------------------- 核心函数 -------------------- */
/**
 * 判断一组环境变量中是否存在非空配置
 */
export function hasEnvironmentValue(
  environment: ServerEnvironment,
  keys: readonly string[],
) {
  return keys.some(key => normalizeEnvironmentString(environment[key]) !== undefined)
}

/**
 * 创建带默认值和闭区间限制的整数环境 Schema
 */
export function createIntegerEnvironmentSchema(
  defaultValue: number,
  minimum: number,
  maximum: number,
) {
  return z.preprocess(
    normalizeEnvironmentNumber,
    z.number().int().min(minimum).max(maximum).default(defaultValue),
  )
}

/**
 * 创建只接受 true 或 false 的布尔环境 Schema
 */
export function createBooleanEnvironmentSchema(defaultValue: boolean) {
  return z.preprocess(
    normalizeEnvironmentBoolean,
    z.boolean().default(defaultValue),
  )
}

/** -------------------- 内部函数 -------------------- */
/** 将普通环境变量去除首尾空白并把空值投影为未配置 */
function normalizeEnvironmentString(value: unknown) {
  if (typeof value !== 'string')
    return value

  return value.trim() || undefined
}

/** 保留敏感值的原始字符并把全空白内容投影为未配置 */
function normalizeEnvironmentSecret(value: unknown) {
  if (typeof value !== 'string')
    return value

  return value.trim() ? value : undefined
}

/** 将非空数字文本转换为 Zod 可校验的数值 */
function normalizeEnvironmentNumber(value: unknown) {
  const normalized = normalizeEnvironmentString(value)

  return typeof normalized === 'string' ? Number(normalized) : normalized
}

/** 将标准布尔文本转换为布尔值并保留非法输入供 Zod 拒绝 */
function normalizeEnvironmentBoolean(value: unknown) {
  const normalized = normalizeEnvironmentString(value)

  if (normalized === 'true')
    return true
  if (normalized === 'false')
    return false

  return normalized
}

/** 判断地址是否使用 HTTP 或 HTTPS 协议 */
function isHttpUrl(value: string) {
  const protocol = new URL(value).protocol

  return protocol === 'http:' || protocol === 'https:'
}
