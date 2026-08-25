interface ThreadTarget {
  /** 线程标识 */
  threadId: string
}

export function selectThread(source: ThreadTarget, target: ThreadTarget) {
  const { threadId } = source
  const { threadId: selectedThreadId } = target
  const previousThreadId = threadId

  return { previousThreadId, threadId: selectedThreadId }
}
