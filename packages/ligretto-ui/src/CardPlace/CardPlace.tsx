import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'

export interface CardPlaceProps {}

const useStyles = makeStyles(
  createStyles({
    cardPlace: {
      height: '120px',
      width: '84px',
      borderRadius: '4px',
      border: 'white solid 12px',
    },
  }),
)

export const CardPlace: React.FC<CardPlaceProps> = ({ children }) => {
  const classes = useStyles()

  return <div className={classes.cardPlace}>{children}</div>
}

CardPlace.displayName = 'CardPlace'
