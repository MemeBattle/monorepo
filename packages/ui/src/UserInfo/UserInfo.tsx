import type { MouseEventHandler } from 'react'
import { styled } from '@mui/material/styles'
import React from 'react'
import Button from '@mui/material/Button'
import CreateIcon from '@mui/icons-material/Create'
import ClearIcon from '@mui/icons-material/Clear'
import Paper from '@mui/material/Paper'

const PREFIX = 'UserInfo'

const classes = {
  userInfo: `${PREFIX}-userInfo`,
  image: `${PREFIX}-image`,
  buttonField: `${PREFIX}-buttonField`,
  button: `${PREFIX}-button`,
  clearIcon: `${PREFIX}-clearIcon`,
  createIcon: `${PREFIX}-createIcon`,
  userNameField: `${PREFIX}-userNameField`,
}

const StyledPaper = styled(Paper)(() => ({
  [`& .${classes.userInfo}`]: {
    maxWidth: '20rem',
    position: 'relative',
    width: '20rem',
    height: '13rem',
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
  },

  [`& .${classes.image}`]: {
    marginTop: '0.5rem',
    maxWidth: '100%',
    width: '9rem',
    height: '9rem',
  },

  [`& .${classes.buttonField}`]: {
    height: '100%',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
  },

  [`& .${classes.button}`]: {
    width: '70%',
    height: '3rem',
    padding: '0.5rem',
    textTransform: 'none',
    fontSize: '1.5rem',
  },

  [`& .${classes.clearIcon}`]: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 'auto',
    color: '#FFF',
  },

  [`& .${classes.createIcon}`]: {
    marginLeft: 0,
  },

  [`& .${classes.userNameField}`]: {
    textOverflow: 'ellipsis',
    width: '10rem',
    overflow: 'hidden',
    marginLeft: '1.375rem',
  },
}))

export interface UserInfoProps {
  img?: string
  onClick?: MouseEventHandler
  onButtonClick?: MouseEventHandler
  onLogoutClick?: MouseEventHandler
  buttonText?: string
  username?: string
  /**
   * Temporary. Should be removed with refactoring
   * TODO: remove https://ligretto.atlassian.net/browse/LIG-159
   */
  children: React.ReactNode
}

export const UserInfo: React.FC<UserInfoProps> = ({ onClick, username, onButtonClick, onLogoutClick, buttonText, children }) => {
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
    <StyledPaper>
      <div className={classes.userInfo}>
        <div className={classes.image} onClick={onClick}>
          {children}
        </div>
        <div className={classes.buttonField}>
          {username ? (
            <>
              <Button className={classes.clearIcon} onClick={handleLogoutClick}>
                <ClearIcon />
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
                <div className={classes.userNameField}>{username}</div>
              </Button>
            </>
          ) : (
            <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick}>
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </StyledPaper>
  )
}

UserInfo.displayName = 'MainUser'
