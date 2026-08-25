interface ValidCompilerComponentProps {
  /** 展示内容 */
  label: string
}

export function ValidCompilerComponent(props: ValidCompilerComponentProps) {
  const { label } = props

  return <span>{label}</span>
}
