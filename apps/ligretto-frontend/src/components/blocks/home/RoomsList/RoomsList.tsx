import React from 'react'
import { styled } from '@mui/material/styles'
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import { Stack, Typography, Box } from '@memebattle/ui'

type Room = { onClick?: () => void; name: string; id: string; playersCount: number; playersMaxCount: number; isDisabled?: boolean }

export interface RoomsListProps {
  rooms: Array<Room>
}

const StyledStack = styled(Stack)(() => ({
  overflowY: 'auto',
  width: '100%',
  maxHeight: '100%',
  '::-webkit-scrollbar': {
    display: 'none',
  },
}))

const StyledRoomsListItem = styled('div')<{ isDisabled?: boolean }>(({ theme, isDisabled }) => ({
  display: 'flex',
  flexShrink: 0,
  backgroundColor: theme.palette.primary.lighter,
  cursor: isDisabled ? 'default' : 'pointer',
  height: '4rem',
  borderRadius: '0.25rem',
  alignItems: 'center',
  padding: '0 2.5rem',
  [theme.breakpoints.down('md')]: {
    height: '3.25rem',
    padding: '0 2rem',
  },
  [theme.breakpoints.down('sm')]: {
    height: '2.5rem',
    padding: '0 1.25rem',
  },
}))

export const RoomsList: React.FC<RoomsListProps> = ({ rooms }) => (
  <StyledStack spacing={{ xs: '0.25rem', sm: '0.5rem' }}>
    {rooms.map(({ name, id, playersCount, playersMaxCount, onClick, isDisabled }) => (
      <StyledRoomsListItem isDisabled={isDisabled} title={name} key={id} onClick={onClick}>
        <Typography textOverflow="ellipsis" noWrap fontSize={{ xs: '1rem', sm: '1.25rem', md: '1.5rem' }} flex={1}>
          {name}
        </Typography>
        <Stack alignItems="center" direction="row" spacing={{ xs: '1.375rem', sm: '4.25rem' }}>
          <Box display="flex" alignItems="center">
            <Typography fontSize={{ xs: '1rem', sm: '1.5rem', md: '2rem' }}>
              {playersCount}/{playersMaxCount}
            </Typography>
          </Box>
          <Box fontSize={{ xs: '1.5rem', sm: '2.25rem', md: '2.75rem' }} display="flex">
            <PlayCircleOutlineOutlinedIcon opacity={isDisabled ? 0.5 : 1} fontSize="inherit" />
          </Box>
        </Stack>
      </StyledRoomsListItem>
    ))}
  </StyledStack>
)
