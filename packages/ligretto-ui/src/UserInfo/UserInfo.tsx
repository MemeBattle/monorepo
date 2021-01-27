import React, { useMemo } from 'react'
import { createStyles, makeStyles, Button } from '@material-ui/core'
import user1 from './assets/u1.svg'
import user2 from './assets/u2.svg'
import user3 from './assets/u3.svg'
import user4 from './assets/u4.svg'
import user5 from './assets/u5.svg'
import user6 from './assets/u6.svg'
import user7 from './assets/u7.svg'
import user8 from './assets/u8.svg'
import { Typography } from '../Typography'

const userAvatars = [user1, user2, user3, user4, user5, user6, user7, user8]

const getRandomAvatar = () => userAvatars[Math.floor(Math.random() * userAvatars.length)]

const useStyles = makeStyles(
  createStyles({
    mainUser: {
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '12rem',
    },
    mainUserAvatar: {
      width: '12rem',
      height: 'auto',
      maxHeight: '12rem',
      display: 'flex',
      cursor: 'pointer',
    },
    image: {
      maxWidth: '100%',
      maxHeight: '100%',
    },
    bottom: {
      marginTop: '1rem',
      display: 'flex',
      justifyContent: 'center',
    },
    username: {
      fontWeight: 'bold',
      fontSize: '1.5rem',
      color: 'white',
    },
  }),
)

export interface UserInfoProps {
  img?: string
  onClick?: () => void
  onButtonClick?: () => void
  buttonText?: string
  username?: string
}

export const UserInfo: React.FC<UserInfoProps> = ({ img, onClick, username, onButtonClick, buttonText }) => {
  const classes = useStyles()

  const imageSrc = useMemo(() => img || getRandomAvatar(), [img])

  return (
    <div className={classes.mainUser}>
      <div className={classes.mainUserAvatar} onClick={onClick}>
        <img className={classes.image} src={imageSrc} alt={username} />
      </div>
      <div className={classes.bottom}>
        {username ? (
          <Typography className={classes.username} align="center">
            {username}
          </Typography>
        ) : (
          <Button variant="contained" size="medium" onClick={onButtonClick}>
            {buttonText}
          </Button>
        )}
      </div>
    </div>
  )
}

UserInfo.displayName = 'MainUser'
