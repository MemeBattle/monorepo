import { Button, Container, Input } from '@memebattle/ligretto-ui'
import type { FormApi } from 'final-form'
import { useCallback, useMemo } from 'react'

import { Paper } from '../../components/Paper'
import { Header } from '../../components/Header'
import { Field, Form } from 'react-final-form'
import { t } from '../../utils/i18n'
import { CreatedByInfo } from '../../components/CreatedByInfo'

import type { ProfileFormValues } from './ProfilePage.types'
import { useCasServices } from '../../modules/cas-services'
import { useProfileRequest } from './useProfileRequest'

export const ProfilePage = () => {
  const { updateUserProfileService } = useCasServices()

  const [profile, isProfileLoading] = useProfileRequest()

  const initialValues = useMemo<ProfileFormValues | undefined>(
    () =>
      profile
        ? {
            email: profile.email,
            username: profile.username,
          }
        : undefined,
    [profile],
  )

  const handleSubmit = useCallback(
    async ({ username }: ProfileFormValues, form: FormApi<ProfileFormValues>) => {
      if (profile && form.getState().dirty) {
        await updateUserProfileService({
          userId: profile.id,
          token: profile.token,
          username,
          avatar: new File([], 'FilenameAvatar.png'),
        })
      } else {
        console.log('Form wasnt modified')
      }
    },
    [updateUserProfileService, profile],
  )

  return !isProfileLoading ? (
    <Container component="main" maxWidth="xs">
      <Header />
      <Form<ProfileFormValues>
        onSubmit={handleSubmit}
        initialValues={initialValues}
        render={({ handleSubmit, submitError }) => (
          <form onSubmit={handleSubmit}>
            <Paper>
              <Field
                name="email"
                render={({ input }) => (
                  <Input value={input.value} variant="filled" margin="normal" fullWidth id="email" label={t.profile.email} name="email" disabled />
                )}
              />
              <Field
                name="username"
                render={({ input, meta }) => (
                  <Input
                    {...input}
                    margin="normal"
                    required
                    fullWidth
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
  ) : null
}
