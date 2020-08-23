import React, { useEffect } from 'react'
import ReactJson from 'react-json-view'
import { useParams } from 'react-router'
import { techConnectToGame } from '@memebattle/ligretto-shared'
import { useDispatch, useSelector } from 'react-redux'
import { All } from '../../types/store'

export const GameJson = () => {
  const { gameId } = useParams<{ gameId: string }>()
  const dispatch = useDispatch()
  const { game } = useSelector((state: All) => state.tech)

  useEffect(() => {
    console.log('effect', gameId)
    if (!gameId) {
      return
    }
    dispatch(techConnectToGame({ gameId }))
  }, [gameId])

  return <>{game ? <ReactJson collapsed src={game} /> : 'Game not loaded'}</>
}
