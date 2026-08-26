import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Server } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'
import { expect, test } from 'vitest'

/** -------------------- 测试 -------------------- */
test('CLI 收到 SIGTERM 后等待服务关闭并正常退出', async () => {
  const port = await findAvailablePort()
  const child = startCli(port)

  try {
    await waitForOutput(child, 'Server:')
    child.kill('SIGTERM')

    await expect(waitForExit(child)).resolves.toEqual([0, null])
  }
  finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
}, 20_000)

test('CLI 监听失败时返回非零退出码并隐藏无关环境值', async () => {
  const occupied = createServer()

  occupied.listen(0, '127.0.0.1')
  await once(occupied, 'listening')
  const port = readPort(occupied)
  const child = startCli(port)
  let stderr = ''

  child.stderr.on('data', chunk => stderr += String(chunk))

  try {
    await expect(waitForExit(child)).resolves.toEqual([1, null])
    expect(stderr).toContain('[server] 启动失败')
    expect(stderr).not.toContain('should-not-leak')
  }
  finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
    await closeServer(occupied)
  }
}, 20_000)

/** -------------------- 测试工具 -------------------- */
/** 启动真实服务命令行入口 */
function startCli(port: number) {
  return spawn(process.execPath, [
    '--import=tsx',
    'projects/server/src/app/server.ts',
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(port),
      TEST_SECRET: 'should-not-leak',
    },
  })
}

/** 等待子进程输出指定启动标记 */
function waitForOutput(child: ChildProcessWithoutNullStreams, expected: string) {
  return new Promise<void>((resolve, reject) => {
    let stdout = ''
    let timeout: ReturnType<typeof setTimeout> | undefined
    let finish: (error?: Error) => void

    /** 收集输出直到出现启动标记 */
    const handleData = (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.includes(expected))
        finish()
    }

    /** 启动标记出现前退出视为失败 */
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(`CLI 提前退出: code=${code}, signal=${signal}`))
    }

    /** 释放当前等待使用的监听器 */
    const cleanup = () => {
      if (timeout)
        clearTimeout(timeout)
      child.off('error', finish)
      child.off('exit', handleExit)
      child.stdout.off('data', handleData)
    }

    /** 完成当前输出等待 */
    finish = (error) => {
      cleanup()
      if (error)
        reject(error)
      else
        resolve()
    }
    timeout = setTimeout(() => finish(new Error(`等待 CLI 输出超时: ${stdout}`)), 10_000)

    child.on('error', finish)
    child.on('exit', handleExit)
    child.stdout.on('data', handleData)
  })
}

/** 等待子进程退出结果 */
async function waitForExit(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null)
    return [child.exitCode, child.signalCode] as const

  const [code, signal] = await once(child, 'exit')

  return [code, signal] as const
}

/** 选择当前可用的合法回环端口 */
async function findAvailablePort() {
  const server = createServer()

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = readPort(server)

  await closeServer(server)
  return port
}

/** 读取监听器端口 */
function readPort(server: Server) {
  const address = server.address()

  if (!address || typeof address === 'string')
    throw new Error('无法读取测试端口')
  return address.port
}

/** 关闭测试监听器 */
function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
