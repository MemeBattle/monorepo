import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Alert } from '@memebattle/ui'

import { dismissKickedFromRoomAction, isKickedFromRoomSelector } from '#ducks/rooms'

export const KickedFromRoomNotice = () => {
  const dispatch = useDispatch()
  const isKickedFromRoom = useSelector(isKickedFromRoomSelector)

  const handleClose = useCallback(() => {
    dispatch(dismissKickedFromRoomAction())
  }, [dispatch])

  if (!isKickedFromRoom) {
    return null
  }

  return (
    <Alert severity="warning" variant="filled" onClose={handleClose} sx={{ mb: { xs: 1, sm: 2 } }} data-test-id="KickedFromRoomNotice">
      You were removed from the room by the host
    </Alert>
  )
}
