import * as React from 'react'
import { SearchInput, SearchInputProps } from 'components/base/search-input'

interface SearchRoomsProps extends SearchInputProps {}
export const SearchRooms: React.FC<SearchRoomsProps> = ({ ...props }) => <SearchInput placeholder="Search rooms..." {...props}></SearchInput>
