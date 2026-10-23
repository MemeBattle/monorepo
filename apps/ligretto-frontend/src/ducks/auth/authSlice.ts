import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

import type { AuthIdentity, AuthState } from './authTypes'

export const authInitialState: AuthState = {
  userId: '',
  accessToken: '',
  expiresAt: 0,
  accountType: null,
  isLoading: false,
  isBootstrapped: false,
}

export const authSlice = createSlice({
  initialState: authInitialState,
  name: '@@auth',
  reducers: {
    getMeRequest: state => {
      state.isLoading = true
    },
    getMeSuccess: (state, { payload }: PayloadAction<AuthIdentity>) => {
      state.userId = payload.userId
      state.accessToken = payload.accessToken
      state.expiresAt = payload.expiresAt
      state.accountType = payload.accountType
      state.isLoading = false
      state.isBootstrapped = true
    },
    // The loader stays over the routes while no identity exists: the app stays behind auth.
    getMeFailure: state => {
      state.isLoading = false
    },
  },
})

export const authReducer = authSlice.reducer
