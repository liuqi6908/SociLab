interface ViewInput {
  /** 展示标签 */
  label: string
  /** 展示状态 */
  status: string
}

interface ViewSession {
  /** 是否等待处理 */
  pending: boolean
}

export function createViewState(
  options: string[],
  input: ViewInput,
  session?: ViewSession,
) {
  return {
    options,
    label: input.label,
    status: input.status,
    pending: session?.pending ?? false,
  }
}
