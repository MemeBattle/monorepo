import React from 'react'
import styles from './Input.module.scss'

export interface InputProps {
  type?: 'text' | 'password'
  name?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}

export const Input: React.FC<InputProps> = ({ type = 'text', value = '', onChange, placeholder = '', name }) => (
  <div className={styles.input}>
    <input type={type} value={value} placeholder={placeholder} onChange={onChange} name={name} />
  </div>
)
