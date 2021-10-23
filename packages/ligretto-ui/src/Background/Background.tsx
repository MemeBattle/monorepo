import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'
import clsx from 'clsx'

const useStyles = makeStyles(
  createStyles({
    background: {
      width: '100%',
      height: '100%',
      position: 'relative',
    },
    figure: {
      position: 'absolute',
      background: '#4BA671',
      color: '#4BA671',
      opacity: 0.2,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      zIndex: '-1',
    },
    circle: {
      borderRadius: '100%',
    },
    rect1: {
      width: '2rem',
      height: '2rem',
      top: '2rem',
      left: '4rem',
      transform: 'rotate(40deg)',
    },
    rect2: {
      width: '3rem',
      height: '3rem',
      bottom: '2rem',
      right: '4rem',
      transform: 'rotate(40deg)',
    },
    rect3: {
      width: '3rem',
      height: '1.5rem',
      bottom: '4rem',
      left: '1rem',
      transform: 'rotate(13deg)',
    },
    rect4: {
      width: '1rem',
      height: '3rem',
      bottom: '1rem',
      left: '50vw',
      transform: 'rotate(156deg)',
    },
    rect5: {
      width: '3rem',
      height: '3rem',
      top: '2rem',
      left: '50%',
      transform: 'rotate(30deg)',
    },
    rect6: {
      width: '10%',
      height: '10%',
      bottom: '40%',
      right: '50%',
      transform: 'rotate(40deg)',
    },
    circle1: {
      width: '34vmin',
      height: '34vmin',
      top: '45%',
    },
    circle2: {
      width: '7vmin',
      height: '7vmin',
      right: '24vmin',
      top: '51%',
    },
    circle3: {
      width: '7rem',
      height: '7rem',
      right: '1rem',
      top: '27%',
    },
    triangle1: {
      borderLeft: '7vmin solid transparent',
      borderRight: '7vmin solid transparent',
      borderBottom: '14vmin solid',
      transform: 'rotate(40deg)',
      right: '2rem',
      top: '2rem',
      background: 'transparent',
    },
    triangle2: {
      borderLeft: '5vmin solid transparent',
      borderRight: '5vmin solid transparent',
      borderBottom: '10vmin solid',
      transform: 'rotate(40deg)',
      left: '30%',
      top: '6rem',
      background: 'transparent',
    },
    triangle3: {
      borderLeft: '6vmin solid transparent',
      borderRight: '6vmin solid transparent',
      borderBottom: '12vmin solid',
      right: '7%',
      top: '65%',
      background: 'transparent',
    },
  }),
)

export const Background: React.FC = ({ children }) => {
  const classes = useStyles()

  return (
    <div className={classes.background}>
      <div className={clsx(classes.figure, classes.circle, classes.circle1)} />
      <div className={clsx(classes.figure, classes.circle, classes.circle2)} />
      <div className={clsx(classes.figure, classes.circle, classes.circle3)} />
      <div className={clsx(classes.figure, classes.rect1)} />
      <div className={clsx(classes.figure, classes.rect2)} />
      <div className={clsx(classes.figure, classes.rect3)} />
      <div className={clsx(classes.figure, classes.rect4)} />
      <div className={clsx(classes.figure, classes.rect5)} />
      <div className={clsx(classes.figure, classes.rect6)} />
      <div className={clsx(classes.figure, classes.triangle1)} />
      <div className={clsx(classes.figure, classes.triangle2)} />
      <div className={clsx(classes.figure, classes.triangle3)} />
      {children}
    </div>
  )
}

Background.displayName = 'Background'
