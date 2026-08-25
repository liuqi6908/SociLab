interface Input {
  /** 原始状态 */
  status: string
}

export function project(input: Input) {
  const { status } = input

  return { status: normalizeStatus(status) }
}

function normalizeStatus(status: string) {
  return status.trim()
}
