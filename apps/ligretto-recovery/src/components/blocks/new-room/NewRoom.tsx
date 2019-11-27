import * as React from 'react'
import { useCallback } from 'react'
import { useState } from 'react'

interface NewRoomProps {
  onCreateRoomButtonClick: (name: string) => void
}

/**
 * Тут дерьмо какое-то, чисто для тестов
 */
export const NewRoom: React.FC<NewRoomProps> = ({ onCreateRoomButtonClick }) => {
  const [name, setName] = useState('')

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }, [])

  const handleButtonClick = useCallback(
    name => () => {
      onCreateRoomButtonClick(name)
    },
    [],
  )

  return (
    <div>
      <input type="text" onChange={handleNameChange} />
      <button onClick={handleButtonClick(name)}>Create new room</button>
    </div>
  )
}
