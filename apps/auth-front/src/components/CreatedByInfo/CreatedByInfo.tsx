import { MemebattleLogo, Typography, Grid } from '@memebattle/ui'
import { t } from '../../utils/i18n'

export const CreatedByInfo = () => (
  <Grid container spacing={2}>
    <Grid container justifyContent="flex-end" alignItems="center" size={8}>
      <Typography variant="caption">{t.createdByInfo.text}</Typography>
    </Grid>
    <Grid size={4}>
      <MemebattleLogo />
    </Grid>
  </Grid>
)

CreatedByInfo.displayName = 'CreatedByInfo'
