import * as React from 'react'
import { AuthPage, RegistrationForm } from 'components/auth'

const Registration: React.FC = () => (
  <AuthPage>
    <RegistrationForm
      email="memebattle@mems.fun"
      userName="memebattle"
      password="asdasdasd"
      repeatPassword="asdasdasd"
      handleSubmit={console.log}
      handleChange={console.log}
    />
  </AuthPage>
)

export default Registration
