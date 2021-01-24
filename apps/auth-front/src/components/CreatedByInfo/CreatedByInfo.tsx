import React from 'react'
import { MemebattleLogo, Typography, Grid } from '@memebattle/ligretto-ui'
import { t } from '../../utils/i18n'

export const CreatedByInfo = () => (
  <Grid container spacing={2}>
    <Grid container item alignItems="center" justify="flex-end" xs={8}>
      <Typography>{t.createdByInfo.text}</Typography>
    </Grid>
    <Grid xs={4} item>
      <MemebattleLogo />
    </Grid>
  </Grid>
)

CreatedByInfo.displayName = 'CreatedByInfo'
