import type { MouseEventHandler } from 'react'
import React from 'react'
import { createStyles, makeStyles, Button } from '@material-ui/core'
import CreateIcon from '@material-ui/icons/Create'
import ClearIcon from '@material-ui/icons/Clear'

import { Avatar } from '../Avatar'
import { Paper } from '../Paper'

const useStyles = makeStyles(() =>
  createStyles({
    mainUser: {
      maxWidth: '20rem',
      position: 'relative',
      width: '20rem',
      height: '13rem',
    },
    mainUserAvatar: {
      display: 'flex',
      justifyContent: 'center',
    },
    image: {
      marginTop: '0.5rem',
      maxWidth: '100%',
      width: '9rem',
      height: '9rem',
    },
    signupButton: {
      position: 'absolute',
      height: '100%',
      width: '100%',
      display: 'inherit',
      alignItems: 'end',
      justifyContent: 'center',
    },
    button: {
      width: '70%',
      height: '3rem',
      marginBottom: '0.5rem',
      textTransform: 'none',
      fontSize: '1.5rem',
    },
    clearIcon: {
      position: 'absolute',
      top: 0,
      right: 0,
      justifyContent: 'flex-end',
      display: 'flex',
      minWidth: 'auto',
    },
    endIcon: {
      position: 'absolute',
      top: '0.65rem',
      right: '0.65rem',
      margin: 0,
    },
    userNameField: {
      textOverflow: 'ellipsis',
      width: '10rem',
      overflow: 'hidden',
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

  return (
    <Paper>
      <div className={classes.mainUser}>
        <div className={classes.mainUserAvatar} onClick={onClick}>
          <div className={classes.image}>
            <Avatar src={img} alt={username} size="auto" />
          </div>
          {username ? (
            <div className={classes.signupButton}>
              <Button className={classes.clearIcon} onClick={handleButtonClick}>
                {<ClearIcon />}
              </Button>
              <Button
                className={classes.button}
                color="primary"
                variant="contained"
                size="large"
                classes={{
                  endIcon: classes.endIcon,
                }}
                endIcon={
                  <div>
                    <CreateIcon />
                  </div>
                }
                onClick={handleButtonClick}
              >
                {<div className={classes.userNameField}>{username}</div>}
              </Button>
            </div>
          ) : (
            <div className={classes.signupButton}>
              <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick}>
                {buttonText}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Paper>
  )
}

UserInfo.displayName = 'MainUser'
