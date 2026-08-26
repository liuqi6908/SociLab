import { cn } from '@socilab/shared-ui/utils'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useApi } from '../providers/query'

/** -------------------- 路由 -------------------- */
export const Route = createFileRoute('/')({ component: IndexRoute })

/** -------------------- 核心组件 -------------------- */
/** 显示客户端与服务连接状态 */
function IndexRoute() {
  const api = useApi()
  const info = useQuery(api.meta.info.queryOptions())

  return (
    <main
      className={cn(
        'flex min-h-screen items-center justify-center',
        'bg-background px-6 text-foreground',
      )}
    >
      <section aria-label="服务连接状态" className="w-full max-w-xl bg-surface px-8 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">SociLab 客户端</h1>
        {info.isPending && <p className="mt-4 text-sm" role="status">正在连接服务</p>}
        {info.isError && <p className="mt-4 text-sm text-primary" role="alert">连接失败</p>}
        {info.isSuccess && (
          <p className="mt-4 text-sm" role="status">
            连接成功：
            {info.data.name}
            {' '}
            {info.data.version}
          </p>
        )}
      </section>
    </main>
  )
}
