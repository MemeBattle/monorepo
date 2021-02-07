import type { Game, UpdateGameAction } from '@memebattle/ligretto-shared'
import { GameTypes } from '@memebattle/ligretto-shared'
import { createSlice } from '@reduxjs/toolkit'

export type TechState = {
  game: Game | null
}

const initialState: TechState = {
  game: null,
}

const techSlice = createSlice({
  name: 'tech',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder.addCase(GameTypes.UPDATE_GAME, (state, action: UpdateGameAction) => {
      state.game = action.payload
    })
  },
})

export const techReducer = techSlice.reducer
