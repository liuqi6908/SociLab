import { z } from 'zod'
import { environmentSecretSchema, environmentStringSchema, hasEnvironmentValue } from './environment.js'

/** -------------------- 类型 -------------------- */
/** 阿里云短信连接配置 */
export interface SmsConfig {
  /** AccessKey ID */
  accessKeyId: string
  /** AccessKey Secret */
  accessKeySecret: string
  /** 短信服务 region */
  region: string
  /** 已审核通过的短信签名 */
  signName: string
  /** 已审核通过的验证码模板 CODE */
  codeTemplateCode: string
}

/** -------------------- 常量 -------------------- */
/** 短信配置组环境变量 */
const smsEnvironmentKeys = [
  'SMS_ACCESS_KEY_ID',
  'SMS_ACCESS_KEY_SECRET',
  'SMS_REGION',
  'SMS_SIGN_NAME',
  'SMS_CODE_TEMPLATE_CODE',
] as const

/** -------------------- Schema -------------------- */
/** 短信环境变量边界 */
const smsEnvironmentSchema = z.object({
  SMS_ACCESS_KEY_ID: environmentStringSchema,
  SMS_ACCESS_KEY_SECRET: environmentSecretSchema,
  SMS_CODE_TEMPLATE_CODE: environmentStringSchema,
  SMS_REGION: environmentStringSchema.default('cn-hangzhou'),
  SMS_SIGN_NAME: environmentStringSchema,
}).transform(environment => ({
  accessKeyId: environment.SMS_ACCESS_KEY_ID,
  accessKeySecret: environment.SMS_ACCESS_KEY_SECRET,
  codeTemplateCode: environment.SMS_CODE_TEMPLATE_CODE,
  region: environment.SMS_REGION,
  signName: environment.SMS_SIGN_NAME,
}))

/** -------------------- 核心函数 -------------------- */
/**
 * 读取已启用的阿里云短信配置
 */
export function loadSmsConfig(environment: NodeJS.ProcessEnv): SmsConfig | undefined {
  if (!hasEnvironmentValue(environment, smsEnvironmentKeys))
    return

  return smsEnvironmentSchema.parse(environment)
}
