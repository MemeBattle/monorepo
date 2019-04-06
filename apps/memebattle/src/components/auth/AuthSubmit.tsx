import * as React from 'react'
import { Button } from '@memebattle/components-base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  children: React.ReactNode
}

const AuthSubmit: React.FC<Props> = ({ children }) => (
  <Button type="submit" className={styles.submit} disabled>
    {children}
  </Button>
)

export default React.memo(AuthSubmit)
