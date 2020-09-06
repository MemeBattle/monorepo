import React from 'react'
import { useSelector } from 'react-redux'
import { selectGameResults } from 'ducks/game'

export const GameResults = () => {
  const results = useSelector(selectGameResults)

  return <div key={String(results)} />
}
