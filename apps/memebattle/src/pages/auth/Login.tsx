import * as React from 'react'
import { Box } from '@components/base'
import { LoginForm } from 'components/auth'

const Login: React.FC = () => (
  <Box is="div">
    <LoginForm
      userName="Meme"
      password="asdasd"
      rule={false}
      handleChange={console.log}
      handleSubmit={console.log}
    />
  </Box>
)

export default Login
