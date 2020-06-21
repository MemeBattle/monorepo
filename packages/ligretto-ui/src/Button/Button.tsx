import React from 'react'

interface ButtonProps {
  onClick: () => void
}
export const Button: React.FC<ButtonProps> = ({ children, onClick }) => <button onClick={onClick}>{children}</button>
