import React from 'react'
import { MemebattleLogo, Typography, Grid } from '@memebattle/ui'
import { t } from '../../utils/i18n'

export const CreatedByInfo = () => (
  <Grid container spacing={2}>
    <Grid container item justifyContent="flex-end" alignItems="center" xs={8}>
      <Typography variant="caption">{t.createdByInfo.text}</Typography>
    </Grid>
    <Grid xs={4} item>
      <MemebattleLogo />
    </Grid>
  </Grid>
)

CreatedByInfo.displayName = 'CreatedByInfo'
