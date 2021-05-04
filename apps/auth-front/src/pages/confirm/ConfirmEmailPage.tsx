import { Container, Typography } from '@memebattle/ligretto-ui'

import { t } from '../../utils/i18n'
import { useLocation } from 'react-router'
import { useMemo } from 'react'

export const ConfirmEmailPage = () => {
  const { search } = useLocation()

  const { email } = useMemo<{ email: string | null; username: string | null }>(() => {
    const searchParams = new URLSearchParams(search)
    return { email: searchParams.get('email'), username: searchParams.get('username') }
  }, [search])

  return (
    <Container component="main" maxWidth="xs">
      <Typography variant="h2">{t.confirmEmail.header}</Typography>
      <Typography paragraph>{t.confirmEmail.message({ email })}</Typography>
    </Container>
  )
}
