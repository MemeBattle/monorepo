import type { MouseEventHandler } from 'react'
import React from 'react'
import { Button } from '@mui/material'
import { createStyles, makeStyles } from '@mui/styles'
import CreateIcon from '@mui/icons-material/Create'
import ClearIcon from '@mui/icons-material/Clear'

import { Avatar } from '../Avatar'
import { Paper } from '../Paper'

const useStyles = makeStyles(() =>
  createStyles({
    userInfo: {
      maxWidth: '20rem',
      position: 'relative',
      width: '20rem',
      height: '13rem',
      display: 'flex',
      alignItems: 'center',
      flexDirection: 'column',
    },
    image: {
      marginTop: '0.5rem',
      maxWidth: '100%',
      width: '9rem',
      height: '9rem',
    },
    buttonField: {
      height: '100%',
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
    },
    button: {
      width: '70%',
      height: '3rem',
      padding: '0.5rem',
      textTransform: 'none',
      fontSize: '1.5rem',
    },
    clearIcon: {
      position: 'absolute',
      top: 0,
      right: 0,
      minWidth: 'auto',
    },
    createIcon: {
      marginLeft: 0,
    },
    userNameField: {
      textOverflow: 'ellipsis',
      width: '10rem',
      overflow: 'hidden',
      marginLeft: '1.375rem',
    },
  }),
)

export interface UserInfoProps {
  img?: string
  onClick?: MouseEventHandler
  onButtonClick?: MouseEventHandler
  onLogoutClick?: MouseEventHandler
  buttonText?: string
  username?: string
}

export const UserInfo: React.FC<UserInfoProps> = ({ img, onClick, username, onButtonClick, onLogoutClick, buttonText }) => {
  const classes = useStyles()

  const handleButtonClick: MouseEventHandler = e => {
    e.stopPropagation()

    if (onButtonClick) {
      onButtonClick(e)
    }
  }

  const handleLogoutClick: MouseEventHandler = e => {
    e.stopPropagation()

    if (onLogoutClick) {
      onLogoutClick(e)
    }
  }

  return (
    <Paper>
      <div className={classes.userInfo}>
        <div className={classes.image} onClick={onClick}>
          <Avatar src={img} alt={username} size="auto" />
        </div>
        <div className={classes.buttonField}>
          {username ? (
            <>
              <Button className={classes.clearIcon} onClick={handleLogoutClick}>
                {<ClearIcon />}
              </Button>
              <Button
                className={classes.button}
                classes={{ endIcon: classes.createIcon }}
                color="primary"
                variant="contained"
                size="large"
                endIcon={<CreateIcon />}
                onClick={handleButtonClick}
              >
                {<div className={classes.userNameField}>{username}</div>}
              </Button>
            </>
          ) : (
            <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick}>
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </Paper>
  )
}

UserInfo.displayName = 'MainUser'
