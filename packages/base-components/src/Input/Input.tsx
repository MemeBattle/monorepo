import React from 'react'

interface Props {
  id: string,
  value: any,
  type: string,
  placeholder: string,
  label: React.ReactNode,
  onInput: (value: string) => any,
}

export const Input = ({
  id,
  value,
  label,
  type,
  onInput,
  placeholder,
}: Props) => {
  return (
      <>
          <label htmlFor={id}>
              {label}
          </label>
          <input
              id={id}
              type={type}
              value={value}
              onInput={(e: React.ChangeEvent<HTMLInputElement>) => onInput(e.target.value)}
              placeholder={placeholder}
          />
      </>
  )
}
