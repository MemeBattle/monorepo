import React, { Children } from 'react'
import { createStyles, makeStyles } from '@mui/styles'
import clsx from 'clsx'

export interface CardsRowProps {
  className?: string
}

const useStyles = makeStyles(
  createStyles({
    cardsRow: {
      display: 'flex',
    },
    cardWrapper: {
      margin: '0 0.2rem',
    },
  }),
)

export const CardsRow: React.FC<CardsRowProps> = ({ children, className }) => {
  const classes = useStyles()

  return (
    <div className={clsx(classes.cardsRow, className)}>
      {Children.map(children, child => (
        <div className={classes.cardWrapper}>{child}</div>
      ))}
    </div>
  )
}

CardsRow.displayName = 'CardsPanel'
