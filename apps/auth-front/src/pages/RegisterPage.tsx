import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Form, Field } from 'react-final-form'
import { Paper } from '../components/Paper'
import { Button, Container, Input, PasswordInput } from '@memebattle/ligretto-ui'
import { t } from '../utils/i18n'
import { ROUTES } from '../constants/routes'
import { CreatedByInfo } from '../components/CreatedByInfo'
import { Header } from '../components/Header'

export const RegisterPage = memo(() => (
  <Container component="main" maxWidth="xs">
    <Header />
    <Form
      onSubmit={values => console.log(values)}
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
                  label={t.register.username}
                  name="username"
                  autoComplete="username"
                  autoFocus
                />
              )}
            />
            <Field
              name="email"
              render={({ input }) => (
                <Input
                  {...input}
                  variant="outlined"
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label={t.register.email}
                  name="email"
                  autoComplete="email"
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
            <Field
              name="confirmPassword"
              render={({ input }) => (
                <PasswordInput
                  {...input}
                  variant="outlined"
                  margin="normal"
                  required
                  fullWidth
                  name="confirm password"
                  label={t.register.confirmPassword}
                  id="password2"
                />
              )}
            />

            <br />
            <Button type="submit" fullWidth variant="contained" color="primary" size="large">
              {t.register.submit}
            </Button>
            <br />
            <Link to={ROUTES.LOGIN}>{t.register.linkToLogin}</Link>
          </Paper>
        </form>
      )}
    />
    <br />
    <br />
    <br />
    <CreatedByInfo />
  </Container>
))
