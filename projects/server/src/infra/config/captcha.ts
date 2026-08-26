import { z } from 'zod'
import {
  environmentHttpUrlSchema,
  environmentSecretSchema,
  environmentStringSchema,
  hasEnvironmentValue,
} from './environment.js'

/** -------------------- 类型 -------------------- */
/** 自托管 Cap 验证码配置 */
export interface CaptchaConfig {
  /** Server 调用的 Cap 内部或服务端地址 */
  serverEndpoint: string
  /** 浏览器访问的 Cap 公共地址 */
  clientEndpoint: string
  /** Cap 站点 Key */
  siteKey: string
  /** Cap 服务端验证密钥 */
  secretKey: string
}

/** -------------------- 常量 -------------------- */
/** Cap 配置组环境变量 */
const captchaEnvironmentKeys = [
  'CAPTCHA_SERVER_ENDPOINT',
  'CAPTCHA_CLIENT_ENDPOINT',
  'CAPTCHA_SITE_KEY',
  'CAPTCHA_SECRET_KEY',
] as const

/** -------------------- Schema -------------------- */
/** Cap 环境变量边界 */
const captchaEnvironmentSchema = z.object({
  CAPTCHA_CLIENT_ENDPOINT: environmentHttpUrlSchema,
  CAPTCHA_SECRET_KEY: environmentSecretSchema,
  CAPTCHA_SERVER_ENDPOINT: environmentHttpUrlSchema,
  CAPTCHA_SITE_KEY: environmentStringSchema,
}).transform(environment => ({
  clientEndpoint: environment.CAPTCHA_CLIENT_ENDPOINT,
  secretKey: environment.CAPTCHA_SECRET_KEY,
  serverEndpoint: environment.CAPTCHA_SERVER_ENDPOINT,
  siteKey: environment.CAPTCHA_SITE_KEY,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的自托管 Cap 配置
 */
export function loadCaptchaConfig(
  environment: NodeJS.ProcessEnv,
): CaptchaConfig | undefined {
  if (!hasEnvironmentValue(environment, captchaEnvironmentKeys))
    return

  return captchaEnvironmentSchema.parse(environment)
}
