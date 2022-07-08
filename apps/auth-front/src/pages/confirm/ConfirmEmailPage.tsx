import { Container, Typography, EmailSended, Box } from '@memebattle/ui'

import { t } from '../../utils/i18n'
import { useLocation } from 'react-router'
import { useMemo } from 'react'
import { Header } from '../../components/Header'

export const ConfirmEmailPage = () => {
  const { search } = useLocation()

  const { email, username } = useMemo<{ email: string | null; username: string | null }>(() => {
    const searchParams = new URLSearchParams(search)
    return { email: searchParams.get('email'), username: searchParams.get('username') }
  }, [search])

  return (
    <Container component="main" maxWidth="md">
      <Header />
      <Box m={2} justifyContent="center" display="flex">
        <EmailSended />
      </Box>
      <Box m={2}>
        <Typography align="center" variant="h3">
          {t.confirmEmail.header}
          {username && (
            <Typography variant="inherit">
              {' '}
              <b>{username}</b>
            </Typography>
          )}
          !
        </Typography>
      </Box>
      <Box m={1}>
        <Typography align="center" paragraph>
          {t.confirmEmail.message}
          {email ? (
            <Typography variant="inherit">
              <b>{email}</b>
            </Typography>
          ) : (
            'email'
          )}
          . {t.confirmEmail.messageEnd}
        </Typography>
      </Box>
      <Typography align="center" color="textSecondary" variant="caption" paragraph>
        {t.confirmEmail.submessage}
      </Typography>
    </Container>
  )
}
