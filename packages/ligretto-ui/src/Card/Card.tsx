import React from 'react'
import { Card as CardModel, CardColors } from '@memebattle/ligretto-shared'
import { createStyles, makeStyles, Paper, ButtonBase } from '@material-ui/core'

interface CardProps extends CardModel {
  onClick?: () => void
}

interface StylesProps {
  color?: CardColors
  hidden?: boolean
  disabled?: boolean
}

const colorByCardColors: Record<CardColors, string> = {
  [CardColors.green]: '#12a52d',
  [CardColors.red]: '#f93e3e',
  [CardColors.yellow]: '#e2bc3f',
  [CardColors.blue]: '#6987c9',
  [CardColors.empty]: '#000',
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
      cursor: ({ disabled }: StylesProps) => (disabled ? 'default' : 'pointer'),
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      userSelect: 'none',
      background: ({ color }: StylesProps) => (color ? colorByCardColors[color] : colorByCardColors.empty),
      transition: 'box-shadow 100ms',
      '&:hover': {
        boxShadow: ({ disabled }: StylesProps) => (disabled ? undefined : '0.1rem 0.1rem 0.8rem rgba(0, 0, 0, 0.5)'),
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

export const Card: React.FC<CardProps> = ({ value, disabled, onClick, color, hidden }) => {
  const classes = useStyles({ disabled, hidden, color })

  return (
    <div className={classes.cardWrapper}>
      <ButtonBase className={classes.button} disabled={disabled} draggable>
        <Paper classes={{ root: classes.card }} onClick={!disabled ? onClick : () => null}>
          {color !== CardColors.empty && !hidden ? <div className={classes.value}>{value}</div> : null}
        </Paper>
      </ButtonBase>
    </div>
  )
}
