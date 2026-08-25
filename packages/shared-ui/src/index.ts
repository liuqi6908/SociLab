import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** -------------------- 工具函数 -------------------- */
/** 合并条件类名并消解 Tailwind 工具类冲突 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
