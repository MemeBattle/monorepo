import * as React from 'react'
import { Link } from 'react-router-dom'
import BackIcon from 'assets/icons/back-arrow.svg'
import { routes } from 'utils/constants'
import styles from './LinkBack.module.scss'
import * as classNamesBind from 'classnames/bind'
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
