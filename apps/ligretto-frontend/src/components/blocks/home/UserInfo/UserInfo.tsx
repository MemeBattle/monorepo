import type { MouseEventHandler } from 'react'
import { styled } from '@mui/material/styles'
import React from 'react'
import CreateIcon from '@mui/icons-material/Create'
import ClearIcon from '@mui/icons-material/Clear'
import { Paper, Button, Box, Typography } from '@memebattle/ui'
import { Avatar } from 'components/Avatar'

export interface UserInfoProps {
  img?: string
  onClick?: MouseEventHandler
  onButtonClick?: MouseEventHandler
  onLogoutClick?: MouseEventHandler
  username?: string
}

const StyledLogoutButton = styled(Button)(({ theme }) => ({
  color: theme.palette.grey[300],
  position: 'absolute',
  top: 0,
  right: 0,
  minWidth: 'auto',
}))

const StyledAuthorizedButton = styled(Button)(() => ({
  width: '70%',
  height: '3rem',
  padding: '0.5rem',
  textTransform: 'none',

  '& .MuiButton-endIcon': {
    marginLeft: 0,
  },
}))

export const UserInfo: React.FC<UserInfoProps> = ({ onClick, username, onButtonClick, onLogoutClick, img }) => (
  <Paper>
    <Box display="flex" position="relative" height="13rem" alignItems="center" flexDirection="column">
      <Box marginTop="0.5rem" maxWidth="100%" width="9rem" height="9rem" minHeight="9rem" onClick={onClick}>
        <Avatar src={img} alt={username} size="auto" />
      </Box>
      <Box height="100%" width="100%" display="flex" justifyContent="center">
        {username ? (
          <StyledLogoutButton title="logout" onClick={onLogoutClick}>
            <ClearIcon />
          </StyledLogoutButton>
        ) : null}
        <StyledAuthorizedButton color="primary" variant="contained" size="large" endIcon={username ? <CreateIcon /> : null} onClick={onButtonClick}>
          <Typography
            fontSize="1.5rem"
            textOverflow="ellipsis"
            max-width="80%"
            whiteSpace="nowrap"
            overflow="hidden"
            marginLeft={username ? '1.375rem' : '0'}
            padding="0rem 0.5rem"
          >
            {username || 'Sign in'}
          </Typography>
        </StyledAuthorizedButton>
      </Box>
    </Box>
  </Paper>
)

UserInfo.displayName = 'UserInfo'
