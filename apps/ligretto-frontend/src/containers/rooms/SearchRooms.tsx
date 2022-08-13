import { useDispatch, useSelector } from 'react-redux'
import React, { useCallback } from 'react'

import { SearchInput } from 'components/base/search-input'
import { selectIsLoading, selectSearch } from 'ducks/rooms/selectors'
import { searchRoomsAction } from 'ducks/rooms'

interface SearchRoomsContainerProps {
  className: string
}

export const SearchRoomsContainer: React.FC<SearchRoomsContainerProps> = ({ className }) => {
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

  return <SearchInput defaultValue={search} isLoading={isLoading} onChange={handleChange} placeholder="Search rooms..." className={className} />
}
