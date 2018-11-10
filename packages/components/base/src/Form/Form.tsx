import React from 'react'

interface Props {
  className?: string,
  onSubmit: () => any,
  children?: React.ReactNode,
}

export const Form = ({
  onSubmit,
  className,
  children,
}: Props) => {
  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
    >
      {children}
    </form>
  )
}
