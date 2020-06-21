import React, { useCallback, useState } from 'react'
import styles from './CreateRoom.module.scss'
import { Input, PasswordInput } from 'components/base'
import { Button } from '@memebattle/ligretto-ui'

interface NewRoomProps {
  onCreateRoomButtonClick: (options: { name: string; password: string }) => void
}

export const CreateRoom: React.FC<NewRoomProps> = ({ onCreateRoomButtonClick }) => {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
    },
    [setName],
  )

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value)
    },
    [setPassword],
  )

  const handleButtonClick = useCallback(() => {
    onCreateRoomButtonClick({ name, password })
  }, [onCreateRoomButtonClick, name, password])

  return (
    <div className={styles.createRoomCard}>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Room name:</span>
        <Input value={name} onChange={handleNameChange} placeholder="Room name" />
      </div>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Password:</span>
        <div>
          <PasswordInput value={password} onChange={handlePasswordChange} placeholder="Password" />
        </div>
      </div>
      <Button onClick={handleButtonClick}>Create</Button>
    </div>
  )
}
