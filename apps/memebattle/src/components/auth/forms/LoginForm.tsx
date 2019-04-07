import React, { useCallback } from 'react'
import { AuthForm, AuthInput, AuthSubmit, AuthCheckbox } from 'components/auth'
import styles from '../styles/AuthStyles.module.scss'
import { useFormValues } from 'hooks'

interface Values {
  userName: string
  password: string
  rule: boolean
}

interface Props {
  onSubmit: (arg: Values) => any
}

const LoginForm: React.FC<Props> = ({ onSubmit }) => {
  const [{ userName, password, rule }, handleChange] = useFormValues<Values>({
    userName: '',
    password: '',
    rule: false,
  })

  const handleSubmit = useCallback(() => onSubmit({ userName, password, rule }), [
    userName,
    password,
    rule,
  ])

  return (
    <AuthForm onSubmit={handleSubmit}>
      <AuthInput
        value={userName}
        type="text"
        id="userName"
        name="userName"
        onInput={handleChange}
        placeholder="Логин или e-mail"
      />
      <AuthInput
        value={password}
        type="password"
        id="password"
        name="password"
        onInput={handleChange}
        placeholder="Пароль"
      />
      <AuthCheckbox
        id="rule"
        name="rule"
        value={rule}
        onChange={handleChange}
        className={styles.authFormCheckbox}>
        С правилами ознакомлен
      </AuthCheckbox>
      <AuthSubmit>Вход</AuthSubmit>
    </AuthForm>
  )
}

export default LoginForm
