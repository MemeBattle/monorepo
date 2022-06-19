import React from 'react'
import { createStyles, makeStyles } from '@mui/styles'
import clsx from 'clsx'

export interface CardPlaceProps {
  className?: string
}

const useStyles = makeStyles(
  createStyles({
    cardPlace: {
      height: '120px',
      width: '84px',
      borderRadius: '4px',
      border: 'white solid 12px',
      position: 'relative',
    },
    card: {
      position: 'absolute',
      top: '-12px',
      left: '-12px',
    },
  }),
)

export const CardPlace: React.FC<CardPlaceProps> = ({ children, className }) => {
  const classes = useStyles()

  return (
    <div className={clsx(classes.cardPlace, className)}>
      <div className={classes.card}>{children}</div>
    </div>
  )
}

CardPlace.displayName = 'CardPlace'
