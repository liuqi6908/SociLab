/** -------------------- 类型 -------------------- */
/** Web 应用环境变量解析参数 */
export interface LoadWebEnvironmentOptions {
  /** 应用默认监听端口 */
  defaultPort: number
  /** 配置来源，终端环境应覆盖环境文件 */
  environment: Record<string, string | undefined>
  /** 应用独立环境变量前缀 */
  prefix: string
}

/** Web 应用开发和预览运行配置 */
export interface WebEnvironmentConfig {
  /** API 开发代理目标 */
  apiProxyTarget: string
  /** Vite 与 Router 共用的部署基础路径 */
  basePath: string
  /** 开发和预览服务监听主机 */
  host: string
  /** 开发和预览服务监听端口 */
  port: number
}

/** -------------------- 常量 -------------------- */
/** Web 应用默认监听主机 */
const defaultHost = '0.0.0.0'
/** Web 应用默认部署基础路径 */
const defaultBasePath = '/'
/** Web 应用默认 API 开发代理目标 */
const defaultApiProxyTarget = 'http://127.0.0.1:4317'

/** -------------------- 核心函数 -------------------- */
/**
 * 读取并校验单个 Web 应用的 Vite 运行配置
 */
export function loadWebEnvironment({
  defaultPort,
  environment,
  prefix,
}: LoadWebEnvironmentOptions): WebEnvironmentConfig {
  const hostName = `${prefix}_HOST`
  const portName = `${prefix}_PORT`
  const basePathName = `${prefix}_BASE_PATH`
  const apiProxyTargetName = `${prefix}_API_PROXY_TARGET`
  const host = environment[hostName]?.trim() || defaultHost
  const port = parsePort(environment[portName], defaultPort, portName)
  const basePath = parseBasePath(environment[basePathName], basePathName)
  const apiProxyTarget = parseApiProxyTarget(
    environment[apiProxyTargetName],
    apiProxyTargetName,
  )

  return { apiProxyTarget, basePath, host, port }
}

/** -------------------- 内部函数 -------------------- */
/** 解析端口并拒绝无法监听的配置 */
function parsePort(value: string | undefined, defaultPort: number, name: string) {
  if (!value?.trim())
    return defaultPort

  const port = Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`${name} 必须是 1 到 65535 之间的整数`)

  return port
}

/** 规范化应用基础路径并拒绝 URL、查询参数和目录回退 */
function parseBasePath(value: string | undefined, name: string) {
  const input = value?.trim() || defaultBasePath

  if (
    /^[a-z][a-z\d+.-]*:/i.test(input)
    || input.includes('?')
    || input.includes('#')
    || input.includes('\\')
  ) {
    throw new Error(`${name} 必须是应用 pathname`)
  }

  const segments = input.split('/').filter(Boolean)

  if (segments.some(segment => segment === '.' || segment === '..'))
    throw new Error(`${name} 不能包含目录回退`)

  return segments.length > 0 ? `/${segments.join('/')}/` : defaultBasePath
}

/** 解析 API 代理目标并拒绝本地路径、凭据和非 HTTP 协议 */
function parseApiProxyTarget(value: string | undefined, name: string) {
  const input = value?.trim() || defaultApiProxyTarget
  let target: URL

  try {
    target = new URL(input)
  }
  catch {
    throw new Error(`${name} 必须是绝对 HTTP 或 HTTPS 地址`)
  }

  if (
    !['http:', 'https:'].includes(target.protocol)
    || target.username
    || target.password
  ) {
    throw new Error(`${name} 必须是无凭据的 HTTP 或 HTTPS 地址`)
  }

  return target.toString().replace(/\/$/, '')
}
