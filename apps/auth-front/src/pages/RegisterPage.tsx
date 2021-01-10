import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Paper } from '../components/Paper'
import { Button, Container, Input, PasswordInput } from '@memebattle/ligretto-ui'
import { t } from '../utils/i18n'
import { ROUTES } from '../constants/routes'

// eslint-disable-next-line react/display-name
export const RegisterPage = memo(() => (
  <Container component="main" maxWidth="xs">
    <Paper>
      <Input
        variant="outlined"
        margin="normal"
        required
        fullWidth
        id="username"
        label={t.register.username}
        name="username"
        autoComplete="username"
        autoFocus
      />
      <Input variant="outlined" margin="normal" required fullWidth id="email" label={t.register.email} name="email" autoComplete="email" />
      <PasswordInput
        variant="outlined"
        margin="normal"
        required
        fullWidth
        name="password"
        label={t.login.password}
        id="password"
        autoComplete="current-password"
      />
      <PasswordInput
        variant="outlined"
        margin="normal"
        required
        fullWidth
        name="confirm password"
        label={t.register.confirmPassword}
        id="password2"
      />
      <br />
      <Button type="submit" fullWidth variant="contained" color="primary" size="large">
        {t.register.submit}
      </Button>
      <br />
      <Link to={ROUTES.LOGIN}>{t.register.linkToLogin}</Link>
    </Paper>
  </Container>
))
