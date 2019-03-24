import * as React from 'react'
import { Button, Form } from '@components/base'
import { AuthInput } from 'components/auth'
import styles from '../styles/AuthStyles.module.scss'

interface Props {
  email: string
  userName: string
  password: string
  repeatPassword: string
  handleChange: (name: string, value: any) => any
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
    <Button type="submit" className={styles.authFormSubmitButtom}>
      Регистрация
    </Button>
  </Form>
)

export default RegistrationForm
