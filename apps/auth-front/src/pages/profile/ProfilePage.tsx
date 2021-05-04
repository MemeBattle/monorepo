import { Button, Container, Input } from '@memebattle/ligretto-ui'
import { Paper } from '../../components/Paper'
import { Header } from '../../components/Header'
import { Field, Form } from 'react-final-form'
import { t } from '../../utils/i18n'
import { CreatedByInfo } from '../../components/CreatedByInfo'

import type { ProfileFormValues } from './ProfilePage.types'
import { useCallback } from 'react'
import { useCasServices } from '../../modules/cas-services'

export const ProfilePage = () => {
  const { updateUserProfileService } = useCasServices()
  const handleSubmit = useCallback(() => {
    updateUserProfileService({
      userId: '605fd026b61db7003f83a323',
      username: 'themezv2',
      token:
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MDVmZDAyNmI2MWRiNzAwM2Y4M2EzMjMiLCJwZXJtaXNzaW9ucyI6eyJDQVMiOlsiZnVsbCJdfSwiaWF0IjoxNjE5ODcxOTY4LCJleHAiOjE2MjAwNDQ3Njh9.Jh50Zfh8uh-gsgAVkayaNQ5tJtpv-Q8RAW4rTreBmG4p0XnBMlnDle1mZRwjtEDEbvdhyqIc9QTCvlklfExFRrFdqVA6yu-7uQqCagAiqrNprTqDP2GI7XXak9-Lsk1uYrpo-NcRki2Yrto6iH1kJegEx4hpQmtw1oQMfPaCVzIp-LVIJ1CKab_IZDYZF7KWw3FZb4DDHPq-C0lL-yW1p4u821ztiHSQjJtOfosSECV9L5qVVUJmgfJ8i7NDxjdN-ixfh62j6Jfjsy0qI58gA57kbDddAAS-vZ1Pdg6IXfRgJWey2S5oCpLBBjjYqmv1QT5q_7qh-G1zPcfRlmSkai9kYO57EbgTtCmpSQ2lFowfQxg6OTb8Vm61j0EM76Q1l8C12KnmET7c1CSBzmBOvaHe3N8lagdopp4kcYXDPXcp6suUlynByNZudsnYbcYteSP0HXd7dbXhDpgMV7sXUy6HR3k2BU92bLTH-IcS6DRwNS30bCXtVVfBPq3_rjJ7CcfQxVMIw3lLrN6d6Thr6vpsiXkpRe1xNA5GqR1KrlwzW2nv4IN3aPSBgIC2xPR5txmGm5BDb992WgzW75R7DC-yYwdR6E__L3EsGijFzkTMn2ApaOOPx3wrG9KzBA1KpBx6T6HFn_B1HVyyyv-iL4u9qykLCxhuWg1RjED0bWQ',
      avatar: new File([], 'FilenameAvatar.jpg'),
    })
  }, [updateUserProfileService])

  return (
    <Container component="main" maxWidth="xs">
      <Header />
      <Form<ProfileFormValues>
        onSubmit={handleSubmit}
        initialValues={{ username: 'a@mems.fun' }}
        render={({ handleSubmit, submitError }) => (
          <form onSubmit={handleSubmit}>
            <Paper>
              <Input value="a@mems.fun" variant="filled" margin="normal" fullWidth id="email" label={t.profile.email} name="email" disabled />
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
  )
}
