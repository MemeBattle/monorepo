import { useDispatch, useSelector } from 'react-redux'
import React, { useCallback } from 'react'
import { createSelector } from '@reduxjs/toolkit'

import { isLoadingSelector, searchSelector } from 'ducks/rooms/selectors'
import { setSearchRoomsAction } from 'ducks/rooms'
import { InputWithButton } from 'components/InputWithButton'

import SearchIcon from '@mui/icons-material/Search'
import CachedIcon from '@mui/icons-material/Cached'

const searchRoomsContainerSelector = createSelector([isLoadingSelector, searchSelector], (isLoading, search) => ({
  isLoading,
  search,
}))

export const SearchRoomsContainer: React.FC = () => {
  const dispatch = useDispatch()

  const { isLoading, search } = useSelector(searchRoomsContainerSelector)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      dispatch(setSearchRoomsAction({ search: value }))
    },
    [dispatch],
  )

  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSearchRoomsClick = React.useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <InputWithButton>
      <InputWithButton.Input defaultValue={search} onChange={handleChange} inputRef={inputRef} placeholder="Search..." />
      <InputWithButton.ButtonWrapper onClick={handleSearchRoomsClick}>
        <InputWithButton.IconWrapper>{isLoading ? <CachedIcon fontSize="inherit" /> : <SearchIcon fontSize="inherit" />}</InputWithButton.IconWrapper>
      </InputWithButton.ButtonWrapper>
    </InputWithButton>
  )
}
