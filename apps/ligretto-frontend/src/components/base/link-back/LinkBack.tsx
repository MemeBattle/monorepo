import * as React from 'react'
import { Link } from 'react-router-dom'
import * as classNamesBind from 'classnames/bind'

import { routes } from 'utils/constants'
import BackIcon from 'assets/icons/back-arrow.svg'

import styles from './LinkBack.module.scss'

const cx = classNamesBind.bind(styles)

interface LinkBackProps {
  to?: string
  className?: string
}
export const LinkBack: React.FC<LinkBackProps> = ({ to, className }) => (
  <Link className={cx(styles.linkBack, className)} to={to || routes.HOME}>
    <img src={BackIcon} alt="go back" /> Back
  </Link>
)
