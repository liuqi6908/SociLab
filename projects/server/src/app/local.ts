import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { serve } from '@hono/node-server'
import { loadServerConfig } from '../infra/config/index.js'
import { createApp } from './define.js'

/** -------------------- 类型 -------------------- */
/** 启动 HTTP 服务的可注入边界 */
export interface StartServerOptions {
  /** 服务配置来源 */
  environment?: NodeJS.ProcessEnv
  /** 运行期监听错误处理器 */
  onError?: (error: Error) => void
}

/** 已启动服务的生命周期句柄 */
export interface ServerHandle {
  /** HTTP 服务实例 */
  server: Server
  /** 实际监听地址 */
  url: string
  /** 实际监听端口 */
  port: number
  /** 停止监听并等待所有连接关闭 */
  close: () => Promise<void>
}

/** -------------------- 核心函数 -------------------- */
/** 按环境配置启动 HTTP 服务并等待真实监听 */
export async function startServer(
  options: StartServerOptions = {},
): Promise<ServerHandle> {
  const config = loadServerConfig(options.environment)
  const { corsOrigins, host, port: inputPort } = config.server
  const server = await listen(createApp({ corsOrigins }).fetch, host, inputPort)
  const port = readServerPort(server)
  let closing: Promise<void> | undefined

  /** 幂等关闭当前监听器 */
  const close = () => {
    if (closing)
      return closing

    closing = closeServer(server)
    return closing
  }

  /** 把运行期错误交给宿主并关闭当前服务 */
  const handleServerFailure = (error: Error) => {
    options.onError?.(error)
    close().catch(cleanupError => options.onError?.(cleanupError))
  }

  server.on('error', handleServerFailure)

  return { server, url: `http://${host}:${port}`, port, close }
}

/** -------------------- 内部函数 -------------------- */
/** 创建监听器并等待启动结果 */
function listen(
  fetch: ReturnType<typeof createApp>['fetch'],
  hostname: string,
  port: number,
) {
  return new Promise<Server>((resolve, reject) => {
    const server = serve({ createServer, fetch, hostname, port }) as Server

    /** 监听成功后释放启动期错误监听 */
    function handleListening() {
      server.off('error', handleError)
      resolve(server)
    }

    /** 监听失败后释放成功监听 */
    function handleError(error: Error) {
      server.off('listening', handleListening)
      reject(error)
    }

    server.once('error', handleError)
    server.once('listening', handleListening)
  })
}

/** 读取已经监听成功的 TCP 端口 */
function readServerPort(server: Server) {
  const address = server.address()

  if (!address || typeof address === 'string')
    throw new Error('无法读取服务监听端口')
  return address.port
}

/** 停止监听并断开仍存活的连接 */
function closeServer(server: Server) {
  if (!server.listening)
    return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
}
