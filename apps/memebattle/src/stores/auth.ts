import { types } from 'mobx-state-tree'

const AuthStore = types
  .model('AuthStore', {
    isAuthenticated: types.boolean,
  })
  .actions(self => ({
    async signIn() {
      try {
        await Promise.resolve(null)
        self.isAuthenticated = true
      } catch (errors) {
        self.isAuthenticated = false
      }
    },
  }))
