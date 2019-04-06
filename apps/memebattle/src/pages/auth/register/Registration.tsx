import * as React from 'react'
import { AuthContent, RegistrationForm } from 'components/auth'

const Registration: React.FC = () => (
  <AuthContent>
    <RegistrationForm
      email="memebattle@mems.fun"
      userName="memebattle"
      password="asdasdasd"
      repeatPassword="asdasdasd"
      handleSubmit={console.log}
      handleChange={console.log}
    />
  </AuthContent>
)

export default Registration
