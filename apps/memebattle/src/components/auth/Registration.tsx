import * as React from 'react'
import { RegistrationForm } from 'components/auth'
import { useFormValues } from 'hooks'

interface Values {
  email: string
  userName: string
  password: string
  repeatPassword: string
}

const Registration: React.FC = () => {
  const [{ userName, password, repeatPassword, email }, handleChange] = useFormValues<Values>({
    email: '',
    userName: '',
    password: '',
    repeatPassword: '',
  })

  return (
    <RegistrationForm
      email={email}
      userName={userName}
      password={password}
      repeatPassword={repeatPassword}
      handleChange={handleChange}
      handleSubmit={console.log}
    />
  )
}

export default Registration
