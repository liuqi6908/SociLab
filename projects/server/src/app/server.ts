import process from 'node:process'
import { startServer } from './local.js'

/** -------------------- 核心函数 -------------------- */
/** 启动命令行服务并绑定进程退出信号 */
export async function runServer() {
  const server = await startServer({
    onError: (error) => {
      console.error('[server] 运行失败', error)
      process.exitCode = 1
    },
  })

  /** 收到退出信号后完成异步关闭 */
  const shutdown = () => {
    server.close().catch((error) => {
      console.error('[server] 关闭失败', error)
      process.exitCode = 1
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  console.log(`Server: ${server.url}`)
}

/** -------------------- 内部函数 -------------------- */
/** 判断当前模块是否是 Node.js 的可执行入口 */
function isMainModule() {
  return process.argv[1] !== undefined && import.meta.filename === process.argv[1]
}

if (isMainModule()) {
  runServer().catch((error) => {
    console.error('[server] 启动失败', error)
    process.exitCode = 1
  })
}
