export function InvalidCompilerComponent() {
  let status = 'ready'

  try {
    status = 'working'
  }
  finally {
    status = 'done'
  }

  return <span>{status}</span>
}
