import * as React from 'react'

interface Props {
  id: string,
  value: any,
  placeholder: string,
  label: React.ReactNode,
  onInput: (value: string) => any,
}

export const Textarea = ({
  id,
  value,
  label,
  onInput,
  placeholder,
}: Props) => {
  return (
    <>
      <label htmlFor={id}>
          {label}
      </label>
      <textarea
        id={id}
        onInput={(e: React.ChangeEvent<HTMLTextAreaElement>) => onInput(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </>
  )
}
