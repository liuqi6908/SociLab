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
  return submitter.submit({
    requestId,
    userId,
    input,
    hidden: createHidden(input),
    owner: submitter.owner,
  })
}

function createHidden(input: string[]) {
  return input.length === 0
}
