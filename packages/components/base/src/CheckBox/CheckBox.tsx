import React from 'react'

interface Props {
  label?: React.ReactNode
  id: string
  name: string
  className?: string
  value: any
  onChange: (name: string, value: boolean) => any
}

export const CheckBox: React.FC<Props> = ({ id, value, label, name, onChange, className }) => {
  return (
    <>
      <input
        id={id}
        value={value}
        type="checkbox"
        checked={value}
        name={name}
        className={className}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.name, e.target.checked)
        }
      />
      <label htmlFor={id}>{label}</label>
    </>
  )
}
