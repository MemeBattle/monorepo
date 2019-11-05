import * as React from 'react'
import { SearchInput, SearchInputProps } from 'components/base/search-input'
import { connect } from 'react-redux'
import { selectIsLoading } from 'ducks/rooms/selectors'
import { searchRoomsAction } from 'ducks/rooms/actions'
import { All } from 'types/store'

interface SearchRoomsProps extends SearchInputProps {
  isLoading: boolean
  searchRooms: ({ search }: { search: string }) => void
}

export const SearchRoomsContainer: React.FC<SearchRoomsProps> = ({ isLoading, searchRooms, ...props }) => {
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      searchRooms({ search: value })
    },
    [searchRooms],
  )

  return <SearchInput isLoading={isLoading} onChange={handleChange} placeholder="Search rooms..." {...props} />
}

export const SearchRooms = connect(
  (state: All) => ({
    isLoading: selectIsLoading(state),
  }),
  {
    searchRooms: searchRoomsAction,
  },
)(SearchRoomsContainer)
