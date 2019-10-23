import React from 'react'
import styles from './Card.module.scss'
import { Card as CardModel, CardColors } from 'types/entities/card-model'
import cn from 'classnames'

interface CardProps extends CardModel {
  onClick?: () => void
}

export const CardValue: React.FC<{ value?: string }> = ({ value }) => <div className={styles.value}>{value}</div>

export const Card: React.FC<CardProps> = ({ value, disabled, onClick, color, hidden }) => (
  <div
    className={cn(styles.card, styles[color || CardColors.empty], {
      [styles.disabled]: disabled,
      [styles.hidden]: hidden,
    })}
    onClick={!disabled ? onClick : () => null}
  >
    {color !== CardColors.empty ? <CardValue value={value} /> : null}
  </div>
)
