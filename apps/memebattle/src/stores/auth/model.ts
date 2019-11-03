import { types, flow, getParent } from 'mobx-state-tree'
import { authService } from 'services'
import { Store } from '..'

const initialState = {
  isAuthenticated: false,
}

const AuthStore = types
  .model('AuthStore', {
    isAuthenticated: types.boolean,
  })
  .actions(self => ({
    login: flow(function*() {
      try {
        const { user } = yield authService.login({ login: '', password: '' })
        self.isAuthenticated = true
        const userStore = getParent<Store>(self, 1).user
        userStore.setUser(user)
      } catch (errors) {
        // console.log(errors)
      }
      return self.isAuthenticated
    }),
  }))

export default types.optional(AuthStore, initialState)
