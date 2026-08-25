import type { PluginOption } from 'vite'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** -------------------- 配置出口 -------------------- */
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react' }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ] as PluginOption[],
  server: {
    host: '0.0.0.0',
    port: 4318,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4317', ws: true },
    },
    strictPort: true,
  },
})
