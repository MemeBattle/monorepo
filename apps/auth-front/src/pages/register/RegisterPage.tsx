import { memo, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FORM_ERROR } from 'final-form'
import { Form, Field } from 'react-final-form'
import { Paper } from '../../components/Paper'
import { Button, Container, Input, PasswordInput } from '@memebattle/ligretto-ui'
import { t } from '../../utils/i18n'
import { ROUTES } from '../../constants/routes'
import type { RegisterFormSubmissionErrors, RegisterFormValues } from './RegisterPage.types'
import { register } from '../../services/register'
import { Header } from '../../components/Header'

export const RegisterPage = memo(() => {
  const initialValues = useMemo<RegisterFormValues>(
    () => ({
      username: '',
      email: '',
      password: '',
    }),
    [],
  )

  const handleSubmit = useCallback(async (values: RegisterFormValues): Promise<RegisterFormSubmissionErrors | undefined> => {
    try {
      const { data } = await register(values)

      /** If user already exists */
      if (!data.user) {
        return { username: 'User already exists' }
      }

      /** If email already confirmed */
      if (!data.user) {
        return { email: 'Email is already confirmed' }
      }
    } catch (e) {
      return { [FORM_ERROR]: 'Something went wrong' }
    }
  }, [])

  return (
    <Container component="main" maxWidth="xs">
      <Header />
      <Form<RegisterFormValues>
        initialValues={initialValues}
        onSubmit={handleSubmit}
        render={({ handleSubmit, submitError }) => (
          <form onSubmit={handleSubmit}>
            <Paper>
              <Field
                name="username"
                render={({ input, meta }) => (
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
                    error={!meta.modifiedSinceLastSubmit && Boolean(meta.error || meta.submitError)}
                    helperText={!meta.modifiedSinceLastSubmit && meta.submitError}
                  />
                )}
              />
              <Field
                name="email"
                render={({ input, meta }) => (
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
                    error={Boolean(meta.error || meta.submitError)}
                    helperText={meta.error}
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
              {submitError}
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
    </Container>
  )
})
