import React from 'react'
import type { ModalProps as MUIModalProps } from '@mui/material'
import { Modal as MUIModal, Paper } from '@mui/material'

import { createStyles, makeStyles } from '@mui/styles'

const useStylesPaper = makeStyles(
  createStyles({
    root: {
      display: 'inline-flex',
      pointerEvents: 'auto',
    },
  }),
)

const useStylesWrapper = makeStyles(
  createStyles({
    modal: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      pointerEvents: 'none',
    },
  }),
)

export const Modal: React.FC<MUIModalProps> = ({ children, ...props }) => {
  const classes = useStylesWrapper()
  const paperClasses = useStylesPaper()

  return (
    <MUIModal {...props}>
      <div className={classes.modal}>
        <Paper classes={paperClasses}>{children}</Paper>
      </div>
    </MUIModal>
  )
}

Modal.displayName = 'Modal'