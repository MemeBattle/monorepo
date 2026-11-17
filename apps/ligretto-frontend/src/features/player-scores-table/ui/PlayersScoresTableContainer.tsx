import React, { useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { generatePath } from 'react-router'

import { gameIdSelector } from '#ducks/game'
import { routes } from '#shared/constants'

import { shareRoomLink } from '../lib/shareRoomLink'
import type { InviteFeedback } from './PlayersScoresTable'
import { PlayersScoresTable } from './PlayersScoresTable'
import { freeSeatsCountSelector, playersSelector } from './PlayersScoresTable.selectors'

export const PlayersScoresTableContainer = () => {
  const players = useSelector(playersSelector)
  const freeSeatsCount = useSelector(freeSeatsCountSelector)
  const gameId = useSelector(gameIdSelector)
  const [isInvitePending, setIsInvitePending] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback>()
  const isInvitePendingRef = useRef(false)

  const handleInviteClick = async () => {
    if (isInvitePendingRef.current) {
      return
    }
    isInvitePendingRef.current = true
    setIsInvitePending(true)
    setInviteFeedback(undefined)

    const roomUrl = new URL(generatePath(routes.GAME, { roomUuid: gameId }), window.location.origin).href
    const result = await shareRoomLink(roomUrl)

    isInvitePendingRef.current = false
    setIsInvitePending(false)
    if (result === 'copied' || result === 'failed') {
      setInviteFeedback(result)
    }
  }

  return (
    <PlayersScoresTable
      players={players}
      freeSeatsCount={freeSeatsCount}
      isInvitePending={isInvitePending}
      inviteFeedback={inviteFeedback}
      onInviteClick={handleInviteClick}
    />
  )
}
