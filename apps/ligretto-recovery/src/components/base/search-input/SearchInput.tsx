import * as React from 'react'
import searchIcon from 'assets/icons/search.svg'
import styles from './SearchInput.module.scss'
import * as classNamesBind from 'classnames/bind'
const cn = classNamesBind.bind(styles)

export type SearchInputProps = React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>
export const SearchInput: React.FC<SearchInputProps> = ({ className, ...props }) => {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const onIconClick = React.useCallback(() => {
    inputRef.current!.focus()
  }, [])

  return (
    <div className={cn(styles.searchInputWrapper, className, { disabled: props.disabled })}>
      <input ref={inputRef} className={styles.searchInput} placeholder="Search..." {...props} />
      <div className={styles.icon} onClick={onIconClick}>
        <img src={searchIcon} alt="search" />
      </div>
    </div>
  )
}
