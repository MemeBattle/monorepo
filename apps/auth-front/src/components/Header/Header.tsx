import { Typography, Container } from '@memebattle/ligretto-ui'
import { t } from '../../utils/i18n'

export const Header = () => (
  <Container component="header">
    <Typography align="center" variant="h1">
      {t.header}
    </Typography>
  </Container>
)
