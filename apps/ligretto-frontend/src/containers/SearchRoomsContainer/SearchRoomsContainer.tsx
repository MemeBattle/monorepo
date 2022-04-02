import { useDispatch, useSelector } from 'react-redux'
import React, { useCallback } from 'react'
import { createSelector } from 'reselect'

import { isLoadingSelector, searchSelector } from 'ducks/rooms/selectors'
import { searchRoomsAction } from 'ducks/rooms'
import { InputWithButton } from 'components/InputWithButton'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

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
      dispatch(searchRoomsAction({ search: value }))
    },
    [dispatch],
  )

  return (
    <InputWithButton
      type={InputWithButtonTypes.search}
      defaultValue={search}
      isLoading={isLoading}
      onSearchChange={handleChange}
      placeholder="Search.."
    />
  )
}
