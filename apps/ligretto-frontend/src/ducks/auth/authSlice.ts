import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

import type { AuthState } from './authTypes'

export const authInitialState: AuthState = {
  userId: '',
  token: '',
  isLoading: false,
}

export const authSlice = createSlice({
  initialState: authInitialState,
  name: '@@auth',
  reducers: {
    logout: () => authInitialState,
    getMeRequest: (state, _action: PayloadAction<{ token?: string }>) => {
      state.isLoading = true
    },
    getMeSuccess: (state, { payload }: PayloadAction<{ userId: string; token: string; isTemporary: boolean }>) => {
      state.userId = payload.userId
      state.token = payload.token
      state.isLoading = false
    },
  },
})

export const authReducer = authSlice.reducer
