# Task 3：Hono + oRPC 服务端报告

## 结果

- 建立 `@socilab/server`，只注册共享契约中的 `meta.info`
- 同一 oRPC Router 挂载至 `/api/rpc` 与 `/api/openapi`，OpenAPI 文档位于 `/api/openapi/spec.json`
- 实现限定 Origin 的 CORS、结构化 `ApiError`、校验错误与未知异常边界
- 提供环境变量读取、`.env.example`、可构建的 ESM 启动产物与 SIGINT/SIGTERM 关闭处理

## RED / GREEN

RED：

```text
./node_modules/.bin/vitest run tests/server/server.test.ts --reporter=verbose
FAIL tests/server/server.test.ts
Error: Cannot find module '../../projects/server/src/app'
```

GREEN：

```text
./node_modules/.bin/vitest run tests/server --reporter=verbose
Test Files  1 passed (1)
Tests  6 passed (6)
```

覆盖内存 Hono app 的 RPC、OpenAPI 文档、CORS 允许/拒绝、无效输入、`ApiError` 与未知异常边界。未知异常通过 `meta` 模块的 `getInfo` 依赖注入触发；生产默认实现始终返回真实固定元信息，未增加测试路由。

## 最终验证

```text
./node_modules/.bin/tsc -p projects/server/tsconfig.json
./node_modules/.bin/tsc -p projects/server/tsconfig.json --noEmit
./node_modules/.bin/vitest run tests/server --reporter=verbose
```

结果：构建、类型检查通过；server 测试 6/6 通过。

```text
./node_modules/.bin/vitest run --passWithNoTests
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/eslint --cache .
git diff --check
```

结果：根测试 5 个文件、16 个测试全部通过；根类型检查、Lint 与 diff 检查无输出且通过。

## 启动产物验证

在非默认端口 `4420` 运行：

```text
SERVER_HOST=127.0.0.1 SERVER_PORT=4420 \
node projects/server/dist/projects/server/src/index.js
GET /api/rpc/meta/info
SIGTERM
```

实际响应：

```json
{"json":{"name":"SociLab","version":"0.1.0"}}
```

进程在收到 SIGTERM 后正常退出，没有遗留监听器。产物使用显式 `.js` 相对导入，避免 Node ESM 的目录导入错误；未引入 bundler。

## 文件

- `projects/server/package.json`
- `projects/server/tsconfig.json`
- `projects/server/.env.example`
- `projects/server/src/app/index.ts`
- `projects/server/src/app/orpc.ts`
- `projects/server/src/app/router.ts`
- `projects/server/src/infra/env.ts`
- `projects/server/src/modules/meta/index.ts`
- `projects/server/src/index.ts`
- `tests/server/server.test.ts`
- `pnpm-lock.yaml`

## 自审

- 只存在共享契约的 `meta.info` 业务过程；OpenAPI 的 `spec.json` / `docs` 由协议文档插件提供
- RPC Handler 接收未剥离前缀的真实 Hono Request，并明确传入 `/api/rpc` 前缀，SDK 的 `baseUrl + /api/rpc` 不会重复或丢失路径
- oRPC 信封错误在 adapter 边界被收敛为 `@socilab/api` 的 `{ message, code, details }`，校验问题放在 `details.issues`
- `ApiError` 状态、业务码和 details 被保留；未知异常固定返回 500 / `服务器内部错误`，不泄漏原始 message
- CORS 只在显式配置来源时注册，非配置 Origin 不获得 `access-control-allow-origin`
- 未加入鉴权、数据库、文件、队列、模型、进程锁或生命周期抽象

## 顾虑

- 当前执行环境为 Node `24.8.0`，低于仓库 engines 声明的 `>=24.18.1`，pnpm 因此输出警告；所有构建、类型检查、测试和启动验证仍通过。建议在 CI/正式运行环境使用声明的 Node 版本。
