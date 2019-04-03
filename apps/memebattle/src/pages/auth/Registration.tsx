import * as React from 'react'
import { Box } from '@memebattle/components-base'
import { RegistrationForm } from 'components/auth'

const Registration: React.FC = () => (
  <Box is="div">
    <RegistrationForm
      email="memebattle@mems.fun"
      userName="memebattle"
      password="asdasdasd"
      repeatPassword="asdasdasd"
      handleSubmit={console.log}
      handleChange={console.log}
    />
  </Box>
)

export default Registration
