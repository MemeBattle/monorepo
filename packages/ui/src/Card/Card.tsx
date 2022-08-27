import React, { useRef } from 'react'
import { CardColors } from '@memebattle/ligretto-shared'
import { ButtonBase } from '@mui/material'
import { createStyles, makeStyles } from '@mui/styles'
import { useOnClickOutside } from '../utils'

interface CardProps {
  /** Color of card **/
  color?: CardColors
  /** Value of card **/
  value?: number
  /** Selected state of card **/
  selected?: boolean
  /** Disabled state of card **/
  disabled?: boolean
  /** Callback on click outside **/
  onClick?: () => void
  /** Callback on click **/
  onClickOutside?: () => void
}

const colorByCardColors: Record<CardColors, string> = {
  [CardColors.green]: '#12a52d',
  [CardColors.red]: '#f93e3e',
  [CardColors.yellow]: '#e2bc3f',
  [CardColors.blue]: '#6987c9',
  [CardColors.empty]: 'transparent',
}

const useStyles = makeStyles(
  createStyles({
    cardWrapper: {
      height: '120px',
      width: '84px',
      visibility: ({ color }) => (color === CardColors.empty ? 'hidden' : 'visible'),
    },
    button: {
      height: '120px',
      width: '84px',
    },
    card: {
      height: '120px',
      width: '84px',
      position: 'relative',
      cursor: ({ disabled }: CardProps) => (disabled ? 'default' : 'pointer'),
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      userSelect: 'none',
      background: ({ color }: CardProps) => (color ? colorByCardColors[color] : colorByCardColors.empty),
      filter: ({ disabled, selected }: CardProps) => {
        if (selected) {
          return 'drop-shadow(1px 1px 1px black)'
        }

        if (disabled) {
          return 'grayscale(50%) brightness(0.95)'
        }

        return 'none'
      },
      transition: 'box-shadow 100ms',
      '&:hover': {
        boxShadow: ({ disabled }: CardProps) => (disabled ? undefined : '0.1rem 0.1rem 0.8rem rgba(0, 0, 0, 0.5)'),
      },
    },
    value: {
      color: '#fff',
      fontSize: '5rem',
      textAlign: 'center',
      fontWeight: 'bold',
      '&::nth-letter(1)': {
        transform: 'translateX(-4px)',
      },
    },
  }),
)

export const Card: React.FC<CardProps> = ({ value, disabled, selected, onClick, onClickOutside, color }) => {
  const classes = useStyles({ disabled, color, selected })

  const ref = useRef<HTMLDivElement>(null)

  useOnClickOutside(ref, onClickOutside)

  return (
    <div ref={ref} className={classes.cardWrapper}>
      <ButtonBase className={classes.button} disabled={disabled}>
        <div className={classes.card} onMouseDown={onClick}>
          {color !== CardColors.empty ? <div className={classes.value}>{value}</div> : null}
        </div>
      </ButtonBase>
    </div>
  )
}
