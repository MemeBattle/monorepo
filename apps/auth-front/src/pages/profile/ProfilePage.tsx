import { Button, Container, Input } from '@memebattle/ligretto-ui'
import { Paper } from '../../components/Paper'
import { Header } from '../../components/Header'
import { Field, Form } from 'react-final-form'
import { t } from '../../utils/i18n'
import { CreatedByInfo } from '../../components/CreatedByInfo'

import type { ProfileFormValues } from './ProfilePage.types'
import { useCallback } from 'react'
import { AvatarDropZone } from '../../components/AvatarDropZone'

export const ProfilePage = () => {
  const handleSubmit = useCallback((values): ProfileFormValues => {
    return values
  }, [])

  return (
    <Container component="main" maxWidth="xs">
      <Header />
      <Form<ProfileFormValues>
        onSubmit={handleSubmit}
        initialValues={{ username: 'a@mems.fun' }}
        render={({ handleSubmit, submitError }) => (
          <form onSubmit={handleSubmit}>
            <Paper>
              <AvatarDropZone />
              <Input value="a@mems.fun" variant="filled" margin="normal" fullWidth id="email" label={t.profile.email} name="email" disabled />
              <Field
                name="username"
                render={({ input, meta }) => (
                  <Input
                    {...input}
                    margin="normal"
                    required
                    fullWidth
                    onChange={input.onChange}
                    id="username"
                    label={t.profile.username}
                    name="username"
                    error={!meta.modifiedSinceLastSubmit && Boolean(meta.error || meta.submitError)}
                    helperText={!meta.modifiedSinceLastSubmit && meta.submitError}
                  />
                )}
              />
              {submitError}
              <br />
              <Button type="submit" fullWidth variant="contained" color="primary" size="large">
                {t.profile.save}
              </Button>
            </Paper>
          </form>
        )}
      />
      <br />
      <br />
      <br />
      <CreatedByInfo />
    </Container>
  )
}
