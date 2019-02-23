import * as React from 'react'
import { LoginForm } from 'components/auth'
import { useFormValues } from 'hooks'

interface Values {
  userName: string
  password: string
  rule: boolean
}

const Login: React.FC = () => {
  const [{ userName, password, rule }, handleChange] = useFormValues<Values>({
    userName: '',
    password: '',
    rule: false,
  })

  return (
    <LoginForm
      userName={userName}
      password={password}
      rule={rule}
      handleChange={handleChange}
      handleSubmit={console.log}
    />
  )
}

export default Login
