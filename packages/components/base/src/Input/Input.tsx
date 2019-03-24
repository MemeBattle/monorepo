import React from 'react'

interface Props {
  placeholder?: string
  className?: string
  label?: React.ReactNode
  id: string
  value: any
  type: string
  onInput: (name: string, value: string) => any
}

export const Input: React.FC<Props> = ({
  id,
  value,
  label,
  type,
  onInput,
  placeholder,
  className,
}) => {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        className={className}
        onInput={(e: React.ChangeEvent<HTMLInputElement>) => onInput(e.target.name, e.target.value)}
        placeholder={placeholder}
      />
    </>
  )
}

Input.defaultProps = {
  label: '',
  placeholder: '',
}
