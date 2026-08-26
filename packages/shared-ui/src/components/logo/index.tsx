import type { LogoProps } from './props'
import { cn } from '@socilab/shared-ui/utils'

/** -------------------- 常量 -------------------- */
/** 由 Vite 随消费应用构建的平台标识地址 */
const logoUrl = new URL('../../assets/logo.png', import.meta.url).href

/** -------------------- 核心组件 -------------------- */
/** 平台标识 */
export function Logo({ className }: LogoProps) {
  return (
    <img
      alt=""
      aria-hidden
      className={cn('block size-5 shrink-0 object-contain', className)}
      src={logoUrl}
    />
  )
}
