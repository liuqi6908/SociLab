# SociLab

SociLab 是一个基于 TypeScript 的三端应用基础框架，使用 pnpm workspace 与 Turborepo
统一管理服务端、客户端、管理端和共享包。本轮只建立可运行、可测试、可演进的工程骨架，
不实现登录、用户、权限、课程、作业等业务页面或业务逻辑。

## 应用与端口

| 应用 | Workspace | 默认地址 | 职责 |
| --- | --- | --- | --- |
| 服务端 | `@socilab/server` | `http://127.0.0.1:4317` | Hono HTTP 服务、oRPC 与 OpenAPI 入口 |
| 客户端 | `@socilab/client` | `http://localhost:4318` | 面向用户的 React 应用骨架 |
| 管理端 | `@socilab/admin` | `http://localhost:4319` | 面向管理场景的 React 应用骨架 |

客户端和管理端的开发服务器会把 `/api` 代理到服务端。生产构建默认使用同源 API，
也可以通过 `VITE_API_BASE_URL` 指定服务基础地址。

## 技术栈

- Node.js 24.18.1、pnpm 11.18.0、TypeScript 6
- pnpm workspace、Turborepo
- Hono、oRPC、Zod
- React 19、TanStack Query、TanStack Router、React Compiler
- Vite 8、Tailwind CSS 4
- Vitest、Testing Library、ESLint、cspell、commitlint

## 环境要求

- Node.js `>=24.18.1 <25`
- pnpm `11.18.0`

推荐使用仓库声明的版本，避免由 Node.js 或 pnpm 版本差异造成锁文件和构建结果漂移。

## 目录结构

```text
SociLab/
├── packages/
│   ├── api/         # 共享 oRPC 契约、Schema 和 API 路径
│   ├── request/     # HTTP 请求、地址规范化和公共错误边界
│   ├── sdk/         # 客户端与管理端共用的类型化 SDK
│   ├── shared/      # 与运行环境无关的通用类型和工具
│   └── shared-ui/   # 共享主题、样式与 UI 工具
├── projects/
│   ├── server/      # 可运行的 Node.js 服务端
│   ├── client/      # 可运行的用户端应用
│   └── admin/       # 可运行的管理端应用
├── tests/           # 按领域组织的测试与质量守卫
└── docs/            # 业务流程、页面概况和设计图
```

## 安装与环境变量

```bash
pnpm install
cp projects/server/.env.example projects/server/.env
```

服务端环境变量如下：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `127.0.0.1` | HTTP 监听地址 |
| `SERVER_PORT` | `4317` | HTTP 监听端口，无效值会回退到默认端口 |
| `CORS_ORIGINS` | 空 | 允许访问 API 的 Origin，多个值使用逗号分隔 |

客户端和管理端可分别在 `projects/client/.env.local` 与 `projects/admin/.env.local`
设置 `VITE_API_BASE_URL`。本地环境文件已被 Git 忽略，不要提交真实密钥或个人配置。

## 开发、构建与验证

```bash
# 同时启动三端
pnpm dev

# 分别启动服务端、客户端或管理端
pnpm dev:server
pnpm dev:client
pnpm dev:admin

# 构建全部 workspace，并启动已构建的服务端
pnpm build
pnpm start

# 完整质量检查
pnpm test
pnpm test:linter
pnpm typecheck
pnpm lint
pnpm spellcheck
```

生产预览可分别执行 `pnpm --filter @socilab/client preview` 和
`pnpm --filter @socilab/admin preview`。

## `meta.info` 技术契约

当前只公开一条用于验证端到端请求链的共享技术契约：`meta.info`。

- oRPC 地址：`GET /api/rpc/meta/info`
- OpenAPI 地址：`GET /api/openapi/meta/info`
- OpenAPI 文档：`/api/openapi/docs`
- OpenAPI Schema：`/api/openapi/spec.json`
- 输入：严格空对象，不接受额外字段
- 输出：`{ "name": "SociLab", "version": "0.1.0" }`

契约由 `@socilab/api` 定义，服务端实现后同时挂载到 oRPC 与 OpenAPI，客户端和管理端通过
`@socilab/sdk` 的类型化能力调用。它只用于证明契约、请求、服务和界面链路已经接通，不承载业务语义。

## 业务文档

- [业务流程](./docs/业务流程.md)
- [页面概况](./docs/页面概况.md)
- 页面设计图位于 [`docs/assets`](./docs/assets/)

这些文档描述后续业务方向，不代表当前工程骨架已经实现对应功能。

## 生成路由

客户端和管理端使用 TanStack Router 文件路由。`projects/client/src/routeTree.gen.ts` 与
`projects/admin/src/routeTree.gen.ts` 由路由插件生成，不要手工编辑；它们也必须继续排除在格式化、
ESLint、拼写检查和自定义质量守卫之外。新增或调整 `src/routes` 下的路由后，通过对应的开发或构建命令
重新生成路由树，并把生成结果随路由变更一起核对。
