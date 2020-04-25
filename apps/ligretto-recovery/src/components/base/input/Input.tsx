import React from 'react'
import styles from './Input.module.scss'

export interface InputProps {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}

export const Input: React.FC<InputProps> = ({ value = '', onChange, placeholder = '' }) => (
  <div className={styles.input}>
    <input type="text" value={value} placeholder={placeholder} onChange={onChange} />
  </div>
)
