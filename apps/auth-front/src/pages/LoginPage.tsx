import { memo } from 'react'
import { Form, Field } from 'react-final-form'
import { Input, PasswordInput, Container, Button } from '@memebattle/ligretto-ui'
import { Paper } from '../components/Paper'
import { t } from '../utils/i18n'
import { ROUTES } from '../constants/routes'
import { Link } from 'react-router-dom'

export const LoginPage = memo(() => (
  <Container component="main" maxWidth="xs">
    <Form
      onSubmit={value => console.log(value)}
      initialValues={{ username: 'sss', password: 'qweqwe' }}
      render={({ handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <Paper>
            <Field
              name="username"
              render={({ input }) => (
                <Input
                  {...input}
                  variant="outlined"
                  margin="normal"
                  required
                  fullWidth
                  id="username"
                  label={t.login.usernameOrEmail}
                  name="username"
                  autoComplete="username"
                  autoFocus
                />
              )}
            />
            <Field
              name="password"
              render={({ input }) => (
                <PasswordInput
                  {...input}
                  variant="outlined"
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label={t.login.password}
                  id="password"
                  autoComplete="current-password"
                />
              )}
            />
            <br />
            <Button type="submit" fullWidth variant="contained" color="primary" size="large">
              {t.login.submit}
            </Button>
            <br />
            <Link to={ROUTES.REGISTER}>{t.login.linkToRegister}</Link>
          </Paper>
        </form>
      )}
    />
  </Container>
))
