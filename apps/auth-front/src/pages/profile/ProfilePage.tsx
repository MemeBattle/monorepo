import { Button, Container, Input } from '@memebattle/ligretto-ui'
import type { FormApi } from 'final-form'
import { FORM_ERROR } from 'final-form'
import { memo, useCallback, useMemo, useState } from 'react'

import { Paper } from '../../components/Paper'
import { Header } from '../../components/Header'
import { Field, Form } from 'react-final-form'
import { t } from '../../utils/i18n'
import { CreatedByInfo } from '../../components/CreatedByInfo'
import { AvatarDropzone } from '../../components/AvatarDropzone'
import type { ProfileFormValues } from './ProfilePage.types'
import { useCasServices } from '../../modules/cas-services'
import { useProfileRequest } from './useProfileRequest'

interface ProfilePageProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
}

export const ProfilePage = memo<ProfilePageProps>(({ onLoginSucceeded }) => {
  const { updateUserProfileService } = useCasServices()
  const [profile, isProfileLoading] = useProfileRequest()

  const [avatar, setAvatar] = useState<File | undefined>(undefined)

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
      if (!profile) {
        return { [FORM_ERROR]: 'Something went wrong' }
      }

      if (form.getState().dirty || avatar) {
        await updateUserProfileService({
          userId: profile.id,
          token: profile.token,
          username,
          avatar,
        })
      }

      onLoginSucceeded({ token: profile.token })
    },
    [profile, avatar, onLoginSucceeded, updateUserProfileService],
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
              <AvatarDropzone onChange={setAvatar} />
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
  ) : null
})
