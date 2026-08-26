import type { Server } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, test } from 'vitest'
import { startServer } from '../../projects/server/src/app/local'

/** -------------------- 测试 -------------------- */
test('startServer 在真实监听后返回实际地址', async () => {
  const port = await findAvailablePort()
  const server = await startServer({
    environment: { SERVER_HOST: '127.0.0.1', SERVER_PORT: String(port) },
  })

  try {
    expect(server.port).toBe(port)
    expect(server.url).toBe(`http://127.0.0.1:${port}`)
    await expect(fetch(`${server.url}/api/rpc/meta/info`).then(value => value.status))
      .resolves
      .toBe(200)
  }
  finally {
    await server.close()
  }
})

test('close 复用同一个 Promise 并允许重复调用', async () => {
  const port = await findAvailablePort()
  const server = await startServer({
    environment: { SERVER_HOST: '127.0.0.1', SERVER_PORT: String(port) },
  })
  const closing = server.close()

  expect(server.close()).toBe(closing)
  await closing
  await expect(server.close()).resolves.toBeUndefined()
})

test('端口已占用时等待监听失败并拒绝启动', async () => {
  const occupied = createServer()

  occupied.listen(0, '127.0.0.1')
  await once(occupied, 'listening')
  const port = readPort(occupied)

  try {
    await expect(startServer({
      environment: { SERVER_HOST: '127.0.0.1', SERVER_PORT: String(port) },
    })).rejects.toMatchObject({ code: 'EADDRINUSE' })
  }
  finally {
    await closeServer(occupied)
  }
})

/** -------------------- 测试工具 -------------------- */
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
    throw new Error('无法读取测试监听端口')
  return address.port
}

/** 关闭测试监听器 */
function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
