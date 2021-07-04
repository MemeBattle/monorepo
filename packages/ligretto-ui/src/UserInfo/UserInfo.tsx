import type { MouseEventHandler } from 'react'
import React from 'react'
import { createStyles, makeStyles, Button } from '@material-ui/core'
import ExitToApp from '@material-ui/icons/ExitToApp'

import { Typography } from '../Typography'
import { Avatar } from '../Avatar'

const useStyles = makeStyles(theme =>
  createStyles({
    mainUser: {
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '12rem',
    },
    mainUserAvatar: {
      width: '12rem',
      height: '12rem',
      maxHeight: '12rem',
      display: 'flex',
      cursor: 'pointer',
      position: 'relative',
      borderRadius: '0.8rem',
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    image: {
      padding: '2px',
      maxWidth: '100%',
      maxHeight: '100%',
    },
    signupButton: {
      position: 'absolute',
      height: '100%',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    button: {
      border: 'solid 2px white',
    },
    backdrop: {
      width: '100%',
      height: '100%',
      background: theme.palette.grey.A700,
      opacity: '40%',
      position: 'absolute',
    },
    bottom: {
      marginTop: '0.5rem',
      display: 'flex',
      justifyContent: 'center',
    },
    username: {
      fontWeight: 'bold',
      fontSize: '1.6rem',
      color: 'white',
    },
  }),
)

export interface UserInfoProps {
  img?: string
  onClick?: MouseEventHandler
  onButtonClick?: MouseEventHandler
  buttonText?: string
  username?: string
}

export const UserInfo: React.FC<UserInfoProps> = ({ img, onClick, username, onButtonClick, buttonText }) => {
  const classes = useStyles()

  const handleButtonClick: MouseEventHandler = e => {
    e.stopPropagation()
    if (onButtonClick) {
      onButtonClick(e)
    }
  }

  return (
    <div className={classes.mainUser}>
      <div className={classes.mainUserAvatar} onClick={onClick}>
        <div className={classes.image}>
          <Avatar src={img} alt={username} size="auto" />
        </div>

        {username ? null : (
          <div className={classes.signupButton}>
            <div className={classes.backdrop} />
            <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick} endIcon={<ExitToApp />}>
              {buttonText}
            </Button>
          </div>
        )}
      </div>
      {username ? (
        <div className={classes.bottom}>
          <Typography className={classes.username} align="center">
            {username}
          </Typography>
        </div>
      ) : null}
    </div>
  )
}

UserInfo.displayName = 'MainUser'
