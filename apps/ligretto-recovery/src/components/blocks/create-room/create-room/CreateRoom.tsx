import React, { useCallback, useState } from 'react'
import styles from './CreateRoom.module.scss'
import { Button, Input } from '@memebattle/ligretto-ui'

interface NewRoomProps {
  onCreateRoomButtonClick: (options: { name: string }) => void
}

export const CreateRoom: React.FC<NewRoomProps> = ({ onCreateRoomButtonClick }) => {
  const [name, setName] = useState('')

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
    },
    [setName],
  )

  const handleButtonClick = useCallback(() => {
    onCreateRoomButtonClick({ name })
  }, [onCreateRoomButtonClick, name])

  return (
    <div className={styles.createRoomCard}>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Room name:</span>
        <Input value={name} onChange={handleNameChange} label="Room name" variant="outlined" placeholder="Tomsk" />
      </div>
      <Button variant="contained" color="primary" size="large" onClick={handleButtonClick}>
        Create
      </Button>
    </div>
  )
}
