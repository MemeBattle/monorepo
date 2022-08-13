import { useDispatch, useSelector } from 'react-redux'
import React, { useCallback } from 'react'

import type { SearchInputProps } from 'components/base/search-input'
import { SearchInput } from 'components/base/search-input'
import { selectIsLoading, selectSearch } from 'ducks/rooms/selectors'
import { searchRoomsAction } from 'ducks/rooms'

export const SearchRoomsContainer: React.FC<SearchInputProps> = ({ ...props }) => {
  const dispatch = useDispatch()

  const isLoading = useSelector(selectIsLoading)
  const search = useSelector(selectSearch)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      dispatch(searchRoomsAction({ search: value }))
    },
    [dispatch],
  )

  return <SearchInput defaultValue={search} isLoading={isLoading} onChange={handleChange} placeholder="Search rooms..." {...props} />
}
