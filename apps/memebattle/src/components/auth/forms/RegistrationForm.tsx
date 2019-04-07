import React, { useCallback } from 'react'
import { AuthForm, AuthInput, AuthSubmit } from 'components/auth'
import { useFormValues } from 'hooks'

interface Values {
  email: string
  userName: string
  password: string
  repeatPassword: string
}

interface Props {
  onSubmit: (arg: Values) => any
}

const RegistrationForm: React.FC<Props> = ({ onSubmit }) => {
  const [{ userName, password, repeatPassword, email }, handleChange] = useFormValues<Values>({
    email: '',
    userName: '',
    password: '',
    repeatPassword: '',
  })

  const handleSubmit = useCallback(() => onSubmit({ email, userName, password, repeatPassword }), [
    email,
    userName,
    password,
    repeatPassword,
  ])

  return (
    <AuthForm onSubmit={handleSubmit}>
      <AuthInput
        value={email}
        type="email"
        id="email"
        name="email"
        onInput={handleChange}
        placeholder="E-Mail"
      />
      <AuthInput
        value={userName}
        type="text"
        id="userName"
        name="userName"
        onInput={handleChange}
        placeholder="User name"
      />
      <AuthInput
        value={password}
        type="password"
        id="password"
        name="password"
        onInput={handleChange}
        placeholder="Password"
      />
      <AuthInput
        value={repeatPassword}
        type="password"
        id="repeatPassword"
        name="repeatPassword"
        onInput={handleChange}
        placeholder="Repeat password"
      />
      <AuthSubmit>Регистрация</AuthSubmit>
    </AuthForm>
  )
}

export default RegistrationForm
