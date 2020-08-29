import React from 'react'
import { Modal } from './Modal'

export default {
  title: 'Modal',
}

export const DefaultView = () => {
  const [isOpen, setIsOpen] = React.useState(false)

  const toggleIsOpen = React.useCallback(() => setIsOpen(prevIsOpen => !prevIsOpen), [setIsOpen])

  return (
    <>
      <button onClick={toggleIsOpen}>Open modal</button>
      <Modal open={isOpen} onClose={toggleIsOpen}>
        <div style={{ width: '200px', height: '200px' }}>Content</div>
      </Modal>
    </>
  )
}
