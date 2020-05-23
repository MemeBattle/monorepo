import React from 'react'
import styles from './Card.module.scss'
import { Card as CardModel, CardColors } from '@memebattle/ligretto-shared'
import cn from 'classnames'

interface CardProps extends CardModel {
  onClick?: () => void
  className?: string
}

export const CardValue: React.FC<{ value?: string | number }> = ({ value }) => <div className={styles.value}>{value}</div>

export const Card: React.FC<CardProps> = ({ value, disabled, onClick, color, hidden, className }) => (
  <div
    className={cn(
      styles.card,
      styles[color || CardColors.empty],
      {
        [styles.disabled]: disabled,
        [styles.hidden]: hidden,
      },
      className,
    )}
    onClick={!disabled ? onClick : () => null}
  >
    {color !== CardColors.empty && !hidden ? <CardValue value={value} /> : null}
  </div>
)
