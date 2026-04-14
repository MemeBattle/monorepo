import { Container, Typography, Box } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { EmailSended } from '../../components/EmailSended'

import { t } from '../../utils/i18n'
import { useLocation } from 'react-router'
import { useMemo } from 'react'
import { Header } from '../../components/Header'

const StyledContainer = styled('div')(() => ({
  height: '100%',
  overflow: 'auto',
}))

export const ConfirmEmailPage = () => {
  const { search } = useLocation()

  const { email, username } = useMemo<{ email: string | null; username: string | null }>(() => {
    const searchParams = new URLSearchParams(search)
    return { email: searchParams.get('email'), username: searchParams.get('username') }
  }, [search])

  return (
    <StyledContainer>
      <Container component="main" maxWidth="md">
        <Header />
        <Box sx={{ m: 2 }} justifyContent="center" display="flex">
          <EmailSended />
        </Box>
        <Box sx={{ m: 2 }}>
          <Typography align="center" variant="h3">
            {t.confirmEmail.header}
            {username && (
              <Typography variant="inherit">
                <b>{username}&nbsp;!</b>
              </Typography>
            )}
          </Typography>
        </Box>
        <Box sx={{ m: 1 }}>
          <Typography align="center" component="p">
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
        <Typography align="center" sx={{ color: 'text.secondary' }} variant="caption" component="p">
          {t.confirmEmail.submessage}
        </Typography>
      </Container>
    </StyledContainer>
  )
}
