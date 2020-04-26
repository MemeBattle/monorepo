import React, { useCallback, useState } from 'react'
import styles from './CreateRoom.module.scss'
import { Input } from 'components/base/input'

interface NewRoomProps {
  onCreateRoomButtonClick: (name: string) => void
}

/**
 * Тут дерьмо какое-то, чисто для тестов
 */
export const CreateRoom: React.FC<NewRoomProps> = ({ onCreateRoomButtonClick }) => {
  const [name, setName] = useState('')

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
    },
    [setName],
  )

  const handleButtonClick = useCallback(() => {
    onCreateRoomButtonClick(name)
  }, [onCreateRoomButtonClick, name])

  return (
    <div className={styles.createRoomCard}>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Room name:</span>
        <Input value={name} onChange={handleNameChange} placeholder="Room name" />
      </div>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Bots:</span>
        <div>
          <Input value={name} onChange={handleNameChange} placeholder="Room name" />
        </div>
      </div>
      <div className={styles.gameOption}>
        <span className={styles.gameOptionName}>Bots:</span>
        <div>
          <Input value={name} onChange={handleNameChange} placeholder="Room name" />
        </div>
      </div>
      <button onClick={handleButtonClick}>Create</button>
    </div>
  )
}
