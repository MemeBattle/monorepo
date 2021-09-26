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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMeRequest: (state, { payload }: PayloadAction<{ token?: string }>) => {
      state.isLoading = true
    },
    getMeSuccess: (state, { payload }: PayloadAction<{ userId: string; token: string }>) => {
      state.userId = payload.userId
      state.token = payload.token
      state.isLoading = false
    },
  },
})

export const authReducer = authSlice.reducer
