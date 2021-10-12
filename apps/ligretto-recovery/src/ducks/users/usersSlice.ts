import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import type { User } from './usersTypes'

export const usersEntityAdapter = createEntityAdapter<User>({
  selectId: user => user.casId,
})

export const usersSlice = createSlice({
  initialState: usersEntityAdapter.getInitialState(),
  name: '@@users',
  reducers: {
    addUser: usersEntityAdapter.addOne,
    addUsers: usersEntityAdapter.addMany,
  },
})

export const usersReducer = usersSlice.reducer
