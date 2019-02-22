import React from 'react'

interface Props {
  id: string
  value: any
  label: React.ReactNode
  onChange: (value: boolean) => any
}

export const CheckBox: React.FC<Props> = ({ id, value, label, onChange }: Props) => {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        type="checkbox"
        checked={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
    </>
  )
}
