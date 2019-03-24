import * as React from 'react'
import { Button, Form } from '@components/base'
import { AuthInput, AuthCheckbox } from 'components/auth/index'
import styles from '../styles/AuthStyles.module.scss'

interface Props {
  userName: string
  password: string
  rule: boolean
  handleChange: (name: string, value: any) => any
  handleSubmit: () => any
}

const LoginForm: React.FC<Props> = ({ userName, password, rule, handleSubmit, handleChange }) => (
  <Form onSubmit={handleSubmit} className={styles.authForm}>
    <AuthInput
      value={userName}
      type="text"
      id="userName"
      name="userName"
      onInput={handleChange}
      placeholder="user name"
    />
    <AuthInput
      value={password}
      type="password"
      id="password"
      name="password"
      onInput={handleChange}
      placeholder="password"
    />
    <AuthCheckbox
      id="rule"
      name="rule"
      value={rule}
      onChange={handleChange}
      className={styles.authFormCheckbox}>
      С правилами ознакомлен
    </AuthCheckbox>
    <Button type="submit" className={styles.authFormSubmitButtom}>
      Вход
    </Button>
  </Form>
)

export default LoginForm
