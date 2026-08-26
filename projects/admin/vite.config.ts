import type { PluginOption, UserConfig } from 'vite'
import process from 'node:process'
import babel from '@rolldown/plugin-babel'
import { loadWebEnvironment } from '@socilab/shared/node'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/** -------------------- 常量 -------------------- */
/** Admin workspace 目录 */
const projectRoot = process.cwd()

/** -------------------- 核心函数 -------------------- */
/**
 * 从已合并的环境变量创建 Admin Vite 配置
 */
export function createAdminViteConfig(
  environment: Record<string, string | undefined>,
): UserConfig {
  const { apiProxyTarget, basePath, host, port } = loadWebEnvironment({
    defaultPort: 4319,
    environment,
    prefix: 'ADMIN',
  })
  const plugins: PluginOption[] = [
    tanstackRouter({ target: 'react' }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ]

  return {
    base: basePath,
    plugins,
    preview: { host, port, strictPort: true },
    server: {
      host,
      port,
      proxy: {
        '/api': { target: apiProxyTarget, ws: true },
      },
      strictPort: true,
    },
  }
}

/** -------------------- 配置出口 -------------------- */
/** 环境文件在配置阶段显式加载，终端环境变量拥有最高优先级 */
export default defineConfig(({ mode }) => {
  const environment = {
    ...loadEnv(mode, projectRoot, ''),
    ...process.env,
  }

  return createAdminViteConfig(environment)
})
