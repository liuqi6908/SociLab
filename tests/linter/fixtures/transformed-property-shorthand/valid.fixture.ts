interface Input {
  /** 原始状态 */
  status: string
}

export function project(input: Input) {
  const { status: _status } = input
  const status = normalizeStatus(_status)

  return { status }
}

function normalizeStatus(status: string) {
  return status.trim()
}

interface ThreadTarget {
  /** 线程标识 */
  threadId: string
}

export function selectThread(source: ThreadTarget, target: ThreadTarget) {
  const { threadId: _threadId } = source
  const { threadId } = target
  const previousThreadId = _threadId

  return { previousThreadId, threadId }
}

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
  const { label, status } = input
  const pending = session?.pending ?? false

  return { options, label, status, pending }
}

interface Submitter {
  /** 提交所有者 */
  owner: string
  /** 提交数据 */
  submit: (input: object) => object
}

export function submitRequest(
  submitter: Submitter,
  requestId: string,
  userId: string,
  input: string[],
) {
  const hidden = createHidden(input)
  const owner = submitter.owner

  return submitter.submit({ requestId, userId, input, hidden, owner })
}

function createHidden(input: string[]) {
  return input.length === 0
}
