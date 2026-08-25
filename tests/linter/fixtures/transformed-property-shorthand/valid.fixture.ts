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
