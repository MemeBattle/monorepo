import * as React from 'react'
import clsx from 'clsx'

import searchIcon from 'assets/icons/search.svg'
import refreshIcon from 'assets/icons/refresh.svg'

import styles from './SearchInput.module.scss'

export interface SearchInputProps extends React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  isLoading?: boolean
}

export const SearchInput: React.FC<SearchInputProps> = ({ className, isLoading, ...props }) => {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const onIconClick = React.useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <div className={clsx(styles.searchInputWrapper, className, { disabled: props.disabled })}>
      <input ref={inputRef} className={styles.searchInput} placeholder="Search..." {...props} />
      <div className={clsx(styles.icon, { isLoading })} onClick={onIconClick}>
        <img src={isLoading ? refreshIcon : searchIcon} alt="search" />
      </div>
    </div>
  )
}
