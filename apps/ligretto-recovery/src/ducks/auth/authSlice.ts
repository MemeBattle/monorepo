import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { AuthState } from './authTypes'

const authInitialState: AuthState = {
  userId: undefined,
  token: undefined,
  isLoading: false,
}

export const authSlice = createSlice({
  initialState: authInitialState,
  name: '@@auth',
  reducers: {
    getMeRequest: (state, { payload }: PayloadAction<{ token: string }>) => {
      state.token = payload.token
      state.isLoading = true
    },
    getMeSuccess: (state, { payload }: PayloadAction<{ userId: string }>) => {
      state.userId = payload.userId
      state.isLoading = false
    },
  },
})

export const authReducer = authSlice.reducer
