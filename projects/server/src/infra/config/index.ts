import process from 'node:process'

/** -------------------- 类型 -------------------- */
/** 服务网络配置 */
export interface ServerConfig {
  /** 监听主机 */
  host: string
  /** 监听端口 */
  port: number
  /** 允许跨域访问 API 的 Origin */
  corsOrigins: string[]
}

/** -------------------- 核心函数 -------------------- */
/** 从进程环境读取服务网络配置 */
export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    corsOrigins: (environment.CORS_ORIGINS ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    host: environment.SERVER_HOST?.trim() || '127.0.0.1',
    port: parsePort(environment.SERVER_PORT),
  }
}

/** -------------------- 内部函数 -------------------- */
/** 解析服务端口并在无效配置时保留安全默认值 */
function parsePort(value: string | undefined) {
  if (!value)
    return 4317

  const port = Number(value)

  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : 4317
}
