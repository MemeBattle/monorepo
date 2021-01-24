import { Container, Typography } from '@memebattle/ligretto-ui'

import { t } from '../utils/i18n'

export const ConfirmEmailPage = () => {
  const email = 'todo@mems.fun'

  return (
    <Container component="main" maxWidth="xs">
      <Typography variant="h2">{t.confirmEmail.header}</Typography>
      <Typography paragraph>{t.confirmEmail.message({ email })}</Typography>
    </Container>
  )
}
