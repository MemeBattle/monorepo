import React from 'react'
import { styled } from '@mui/material/styles'
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import { Stack, useMediaQuery, useTheme, Typography, Box } from '@memebattle/ui'

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
  height: theme.spacing(8),
  borderRadius: 4,
  alignItems: 'center',
  padding: theme.spacing(0, 5),
  [theme.breakpoints.down('md')]: {
    height: theme.spacing(6.5),
    padding: theme.spacing(0, 4),
  },
  [theme.breakpoints.down('sm')]: {
    height: theme.spacing(5),
    padding: theme.spacing(0, 2.5),
  },
}))

export const RoomsList: React.FC<RoomsListProps> = ({ rooms }) => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <StyledStack spacing={isMobile ? 0.5 : 1}>
      {rooms.map(({ name, id, playersCount, playersMaxCount, onClick, isDisabled }) => (
        <StyledRoomsListItem isDisabled={isDisabled} title={name} key={id} onClick={onClick}>
          <Typography textOverflow="ellipsis" noWrap fontSize={isMobile ? '1rem' : isTablet ? '1.25rem' : '1.5rem'} flex={1}>
            {name}
          </Typography>
          <Stack alignItems="center" direction="row" spacing={isMobile ? 2.75 : 8.5}>
            <Box display="flex" alignItems="center">
              <Typography fontSize={isMobile ? '1rem' : isTablet ? '1.5rem' : '2rem'}>
                {playersCount}/{playersMaxCount}
              </Typography>
            </Box>
            <Box fontSize={isMobile ? '1.5rem' : isTablet ? '2.25rem' : '2.75rem'} display="flex">
              <PlayCircleOutlineOutlinedIcon opacity={isDisabled ? 0.5 : 1} fontSize="inherit" />
            </Box>
          </Stack>
        </StyledRoomsListItem>
      ))}
    </StyledStack>
  )
}
