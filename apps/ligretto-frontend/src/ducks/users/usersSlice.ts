import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'

import type { User } from './usersTypes'

export const usersEntityAdapter = createEntityAdapter({
  selectId: (user: User) => user.casId,
})

export const usersSlice = createSlice({
  initialState: usersEntityAdapter.getInitialState(),
  name: '@@users',
  reducers: {
    // An upsert: a refreshed `me` and a `GET /api/users` answer can both write the same id, and the later one wins.
    addUser: usersEntityAdapter.upsertOne,
    addUsers: usersEntityAdapter.addMany,
  },
})

export const usersReducer = usersSlice.reducer
