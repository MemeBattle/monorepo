import React from 'react'

import { Input } from './Input'

export interface PasswordInputProps {
  name?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}

export const PasswordInput: React.FC<PasswordInputProps> = props => <Input type="password" {...props} />
