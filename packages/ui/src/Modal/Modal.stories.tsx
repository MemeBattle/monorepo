import { useState, useCallback } from 'react'
import { Modal } from './Modal'

export default {
  title: 'Ligretto-ui / Modal',
}

export const DefaultView = () => {
  const [isOpen, setIsOpen] = useState(false)

  const toggleIsOpen = useCallback(() => setIsOpen(prevIsOpen => !prevIsOpen), [setIsOpen])

  return (
    <>
      <button onClick={toggleIsOpen}>Open modal</button>
      <Modal open={isOpen} onClose={toggleIsOpen}>
        <div style={{ width: '200px', height: '200px' }}>Content</div>
      </Modal>
    </>
  )
}
