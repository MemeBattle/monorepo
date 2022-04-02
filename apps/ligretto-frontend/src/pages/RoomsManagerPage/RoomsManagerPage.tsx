import * as React from 'react'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { styled } from '@mui/material/styles'

import { MainLayout } from 'components/layouts/main'
import { searchRoomsAction } from 'ducks/rooms'
import { LinkBack } from 'components/base/link-back'
import { RoomsManager } from 'components/blocks/home/RoomsManager'

const StyledRoomManagerPageWrapper = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  height: '100%',
  alignItems: 'center',
  padding: '2rem',
  [theme.breakpoints.down('sm')]: {
    padding: 0,
  },
}))

const StyledContent = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  height: '100%',
  width: '100%',
  alignItems: 'center',
  padding: '0.5rem',
}))

const StyledBottomButtons = styled('div')(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  marginBottom: '1rem',
}))

export const RoomsManagerPage = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(searchRoomsAction({ search: '' }))
  }, [dispatch])

  return (
    <MainLayout>
      <StyledRoomManagerPageWrapper>
        <StyledContent>
          <RoomsManager />
        </StyledContent>
        <StyledBottomButtons>
          <LinkBack />
        </StyledBottomButtons>
      </StyledRoomManagerPageWrapper>
    </MainLayout>
  )
}
