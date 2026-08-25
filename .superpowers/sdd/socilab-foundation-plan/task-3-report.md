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

## Fix Round 1

### 审查问题与覆盖

- `tests/server/server.test.ts` 新增非法 `meta.info` 输出和显式内部 `ORPCError` 的真实 RPC 调用，均断言 500 公共文案且不泄漏 secret
- 精确断言 OpenAPI 文档的 paths 只有 `/meta/info`，并实际请求 `/api/openapi/meta/info`
- 新增允许与拒绝 Origin 的 OPTIONS 预检断言，允许来源具备 ACAO、方法和 `Content-Type` 请求头；拒绝来源没有 ACAO
- 新增纯协议适配边界测试：302 与 304 Response 原样返回；4xx 重建时删除旧 `content-encoding`、`content-length`、`etag`，同时保留 ACAO 与 `retry-after`
- `@socilab/server` 现在显式依赖 `zod@4.4.3`，锁文件已同步

### RED / GREEN

RED：

```text
./node_modules/.bin/vitest run tests/server/server.test.ts --reporter=verbose
Tests  4 failed | 7 passed (11)

输出 schema 校验：expected 500, received 400
内部 ORPCError：received message "secret internal oRPC failure"
3xx / 实体 header 测试：normalizeProtocolResponse is not a function
```

原因：旧边界只检查 `cause instanceof ValidationError`，把输出校验错误错误降为 BAD_REQUEST；5xx `ORPCError` 原样返回；adapter 对所有非 2xx 重写。

GREEN：

```text
./node_modules/.bin/vitest run tests/server/server.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  11 passed (11)
```

实现仅在 `BAD_REQUEST + ValidationError` 时公开输入 issues；未受信任的 5xx oRPC 错误统一映射为 500 / `服务器内部错误`。协议 adapter 只规范化 `status >= 400`，并在创建新 JSON 实体前删除旧实体绑定 headers。

### 最终验证

```text
pnpm --filter @socilab/server build
pnpm --filter @socilab/server typecheck
pnpm --filter @socilab/server test
```

结果：build、typecheck 通过；server 测试 11/11 通过。

```text
./node_modules/.bin/vitest run --passWithNoTests
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/eslint --cache .
git diff --check
```

结果：根测试 5 个文件、21 个测试全部通过；根 typecheck、lint 与 diff check 通过。

### 构建产物实启

在临时端口 `4422` 启动最终产物，成功请求下列真实端点后发送 SIGTERM：

```text
GET /api/rpc/meta/info
GET /api/openapi/meta/info
```

实际输出：

```json
{"rpc":{"json":{"name":"SociLab","version":"0.1.0"}},"openapi":{"name":"SociLab","version":"0.1.0"}}
```

进程正常退出，没有遗留监听器。
