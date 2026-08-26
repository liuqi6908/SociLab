import type { ServerType } from '@hono/node-server'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { loadServerConfig } from '../infra/config/index.js'
import { createApp } from './define.js'

/** -------------------- 类型 -------------------- */
/** 已启动服务的关闭句柄 */
export interface ServerHandle {
  /** HTTP 服务实例 */
  server: ServerType
  /** 停止监听并等待所有连接关闭 */
  close: () => Promise<void>
}

/** -------------------- 核心函数 -------------------- */
/** 按环境配置启动 HTTP 服务 */
export function startServer(): ServerHandle {
  const config = loadServerConfig()
  const { corsOrigins, host, port } = config.server
  const server = serve({
    fetch: createApp({ corsOrigins }).fetch,
    hostname: host,
    port,
  })

  return {
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
    server,
  }
}

/** -------------------- 内部函数 -------------------- */
/** 仅在可执行入口中监听并响应进程退出信号 */
function runServer() {
  const handle = startServer()
  const close = async () => {
    await handle.close()
    process.exit()
  }

  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}

/** 判断当前模块是否是 Node.js 的可执行入口 */
function isMainModule() {
  return process.argv[1] !== undefined && import.meta.filename === process.argv[1]
}

if (isMainModule())
  runServer()
