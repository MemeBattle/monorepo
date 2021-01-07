import React, { FC, memo } from 'react'
import { Input, PasswordInput, Container, Button } from '@memebattle/ligretto-ui'
import { Paper } from '../components/Paper';
import { t } from '../utils/i18n'
import { ROUTES } from '../constants/routes'
import { Link } from 'react-router-dom'

export const LoginPage: FC = memo(() => (
  <Container component='main' maxWidth="xs">
    <Paper>
      <Input
        variant='outlined'
        margin="normal"
        required
        fullWidth
        id="email"
        label={t.login.usernameOrEmail}
        name="username"
        autoComplete="email"
        autoFocus
      />
      <PasswordInput
        variant='outlined'
        margin="normal"
        required
        fullWidth
        name="password"
        label={t.login.password}
        id="password"
        autoComplete="current-password"
      />
      <br/>
      <Button
        type="submit"
        fullWidth
        variant="contained"
        color="primary"
        size="large"
      >
        {t.login.submit}
      </Button>
      <br/>
      <Link to={ROUTES.REGISTER}>
        {t.login.linkToRegister}
      </Link>
    </Paper>
  </Container>
));
