import * as React from 'react'
import { Button, Form } from '@components/base'
import { AuthInput, AuthCheckbox } from 'components/auth'
import styles from './AuthStyles.module.scss'

interface Props {
  email: string
  userName: string
  password: string
  repeatPassword: string
  handleChange: (value: any) => any
  handleSubmit: () => any
}

const RegistrationForm: React.FC<Props> = ({
  email,
  userName,
  password,
  repeatPassword,
  handleSubmit,
  handleChange,
}) => (
  <Form onSubmit={handleSubmit} className={styles.authForm}>
    <AuthInput value={email} type="email" id="email" onInput={handleChange} placeholder="E-Mail" />
    <AuthInput
      value={userName}
      type="text"
      id="userName"
      onInput={handleChange}
      placeholder="User name"
    />
    <AuthInput
      value={password}
      type="password"
      id="password"
      onInput={handleChange}
      placeholder="Password"
    />
    <AuthInput
      value={repeatPassword}
      type="password"
      id="repeatPassword"
      onInput={handleChange}
      placeholder="Repeat password"
    />
    <Button type="submit" className={styles.authFormSubmitButtom}>
      Регистрация
    </Button>
  </Form>
)

export default RegistrationForm
