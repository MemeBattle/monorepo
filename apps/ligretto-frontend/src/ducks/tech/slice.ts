import type { Game } from '@memebattle/ligretto-shared'
import { updateGameAction } from '@memebattle/ligretto-shared'
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
    builder.addCase(updateGameAction.type, (state, action: ReturnType<typeof updateGameAction>) => {
      state.game = action.payload
    })
  },
})

export const techReducer = techSlice.reducer
