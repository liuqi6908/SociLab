/** -------------------- 常量 -------------------- */
/** 全仓守卫共同排除的生成、依赖、构建、缓存与临时目录 */
export const repositoryIgnoredDirNames: ReadonlySet<string> = new Set([
  '.cache',
  '.codegraph',
  '.git',
  '.pnpm-store',
  '.tanstack',
  '.tmp',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
])
/** 全仓守卫共同排除的生成文件 */
export const repositoryIgnoredFileNames: ReadonlySet<string> = new Set([
  'routeTree.gen.ts',
])
