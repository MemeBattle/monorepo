import React from 'react'
import { Form } from '@memebattle/components-base'
import styles from 'components/auth/styles/AuthStyles.module.scss'

interface Props {
  onSubmit: () => any
}

const AuthForm: React.FC<Props> = ({ children, onSubmit }) => (
  <Form onSubmit={onSubmit} className={styles.authForm}>
    {children}
  </Form>
)

export default AuthForm
