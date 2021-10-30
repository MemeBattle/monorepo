import type { MouseEventHandler } from 'react'
import React from 'react'
import { createStyles, makeStyles, Button } from '@material-ui/core'
import CreateIcon from '@material-ui/icons/Create'
import ClearIcon from '@material-ui/icons/Clear'

import { Avatar } from '../Avatar'

const useStyles = makeStyles(theme =>
  createStyles({
    mainUser: {
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '20rem',
      position: 'relative',
    },
    mainUserAvatar: {
      width: '20rem',
      height: '13rem',
      maxHeight: '13rem',
      display: 'flex',
      borderRadius: '0.8rem',
      justifyContent: 'center',
      background: theme.palette.background.paper,
    },
    image: {
      paddingBottom: '1.8rem',
      maxWidth: '50%',
    },
    signupButton: {
      position: 'absolute',
      height: '100%',
      width: '100%',
      display: 'flex',
      alignItems: 'end',
      justifyContent: 'center',
    },
    button: {
      width: '70%',
      marginBottom: '1rem',
      textTransform: 'none',
      '&.MuiButton-containedSizeLarge': {
        padding: 'inherit',
        fontSize: '1.5rem',
      },
    },
    clearIcon: {
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
      justifyContent: 'flex-end',
      display: 'flex',
      minWidth: 'auto',
    },
    createIcon: {
      marginLeft: 'auto',
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
      console.log('CLICK')
    }
  }

  const signInButton = (
    <div className={classes.signupButton}>
      <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick}>
        {buttonText}
      </Button>
    </div>
  )

  const userNameButton = (
    <div className={classes.signupButton}>
      <Button className={classes.clearIcon} onClick={handleButtonClick}>
        {<ClearIcon />}
      </Button>
      <Button
        className={classes.button}
        color="primary"
        variant="contained"
        size="large"
        endIcon={<CreateIcon className={classes.createIcon} />}
        onClick={handleButtonClick}
      >
        {username}
      </Button>
    </div>
  )

  return (
    <div className={classes.mainUser}>
      <div className={classes.mainUserAvatar} onClick={onClick}>
        <div className={classes.image}>
          <Avatar src={img} alt={username} size="auto" />
        </div>
        {username ? userNameButton : signInButton}
      </div>
    </div>
  )
}

UserInfo.displayName = 'MainUser'
