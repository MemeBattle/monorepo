import React from 'react'

interface Props {
  label?: React.ReactNode
  id: string
  className: string
  value: any
  onChange: (value: boolean) => any
}

export const CheckBox: React.FC<Props> = ({ id, value, label, onChange, className }) => {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        type="checkbox"
        checked={value}
        className={className}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
    </>
  )
}
