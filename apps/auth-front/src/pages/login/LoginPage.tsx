import { memo, useCallback, useMemo } from 'react'
import { Field, Form } from 'react-final-form'
import { Button, Container, Input, PasswordInput, FormHelperText, Link as UILink } from '@memebattle/ligretto-ui'
import { Paper } from '../../components/Paper'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { t } from '../../utils/i18n'
import { ROUTES } from '../../constants/routes'
import { Link } from 'react-router-dom'
import type { LoginFormSubmissionError, LoginFormValues } from './LoginPage.types'
import { FORM_ERROR } from 'final-form'
import { useCasServices } from '../../modules/cas-services'

interface LoginPageProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
}

export const LoginPage = memo<LoginPageProps>(({ onLoginSucceeded }) => {
  const { loginService } = useCasServices()

  const initialValues = useMemo<LoginFormValues>(
    () => ({
      username: '',
      password: '',
    }),
    [],
  )

  const handleSubmit = useCallback(
    async (values: LoginFormValues): Promise<LoginFormSubmissionError | undefined> => {
      try {
        const response = await loginService({ login: values.username, password: values.password })

        if (response.success) {
          onLoginSucceeded({ token: response.data.token })
          return
        }

        const { error } = response

        if (error.errorCode === 404) {
          return {
            [FORM_ERROR]: t.login.userNotFound,
          }
        }

        if (error.errorCode === 400) {
          return {
            username: error.errors.find(({ path }) => path.includes('login')) ? t.login.usernameError : undefined,
            password: error.errors.find(({ path }) => path.includes('password')) ? t.login.passwordError : undefined,
          }
        }

        return {
          [FORM_ERROR]: 'Something went wrong',
        }
      } catch (e) {
        return { username: 'Invalid login or password', password: 'Invalid login or password' }
      }
    },
    [loginService, onLoginSucceeded],
  )

  return (
    <Container component="main" maxWidth="xs">
      <Header />
      <Form<LoginFormValues>
        onSubmit={handleSubmit}
        initialValues={initialValues}
        render={({ handleSubmit, submitError, modifiedSinceLastSubmit }) => (
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
                    label={t.login.usernameOrEmail}
                    name="username"
                    autoComplete="username"
                    autoFocus
                    error={!!(meta.error && meta.dirty) || (meta.submitFailed && !modifiedSinceLastSubmit)}
                    helperText={meta.error || meta.submitError}
                  />
                )}
              />
              <Field
                name="password"
                render={({ input, meta }) => (
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
                    error={!!(meta.error && meta.dirty) || (meta.submitFailed && !modifiedSinceLastSubmit)}
                    helperText={meta.error || meta.submitError}
                  />
                )}
              />
              {!modifiedSinceLastSubmit && <FormHelperText error={true}>{submitError}</FormHelperText>}
              <br />
              <Button type="submit" fullWidth variant="contained" color="primary" size="large">
                {t.login.submit}
              </Button>
              <br />
              <UILink underline="always" component={Link} to={ROUTES.REGISTER}>
                {t.login.linkToRegister}
              </UILink>
            </Paper>
          </form>
        )}
      />
      <Footer />
    </Container>
  )
})
