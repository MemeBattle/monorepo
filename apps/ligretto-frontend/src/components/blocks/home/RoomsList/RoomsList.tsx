import React from 'react'
import { styled } from '@mui/material/styles'

import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import { Stack, useMediaQuery, useTheme, Typography, Box } from '@memebattle/ui'

type Room = { onClick?: () => void; name: string; id: string; playersCount: number; playersMaxCount: number; isDisabled?: boolean }

export interface RoomsListProps {
  rooms: Array<Room>
}

const StyledRoomsListItem = styled('div')<{ isDisabled?: boolean }>(({ theme, isDisabled }) => ({
  display: 'flex',
  backgroundColor: theme.palette.primary.lighter,
  cursor: isDisabled ? 'default' : 'pointer',
  height: theme.spacing(8),
  borderRadius: 4,
  alignItems: 'center',
  padding: theme.spacing(0, 4),
  [theme.breakpoints.down('sm')]: {
    height: theme.spacing(5),
    padding: theme.spacing(0, 1),
  },
}))

export const RoomsList: React.FC<RoomsListProps> = ({ rooms }) => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Stack spacing={0.5} width="100%">
      {rooms.map(({ name, id, playersCount, playersMaxCount, onClick, isDisabled }) => (
        <StyledRoomsListItem isDisabled={isDisabled} title={name} key={id} onClick={onClick}>
          <Typography textOverflow="ellipsis" noWrap fontSize={isMobile ? '1rem' : '1.5rem'} flex={1}>
            {name}
          </Typography>
          <Stack alignItems="center" direction="row" spacing={isMobile ? 1.5 : 4}>
            <Box display="flex" alignItems="center">
              <Typography fontSize={isMobile ? '1rem' : '2rem'}>
                {playersCount}/{playersMaxCount}
              </Typography>
            </Box>
            <Box fontSize={isMobile ? '1.5rem' : '2.75rem'} display="flex">
              <PlayCircleOutlineOutlinedIcon opacity={isDisabled ? 0.5 : 1} fontSize="inherit" />
            </Box>
          </Stack>
        </StyledRoomsListItem>
      ))}
    </Stack>
  )
}

RoomsList.displayName = 'RoomsList'
