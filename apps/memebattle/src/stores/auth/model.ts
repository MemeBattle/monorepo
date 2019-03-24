import { types, flow } from 'mobx-state-tree'

const initialState = {
  isAuthenticated: false,
}

const AuthStore = types
  .model('AuthStore', {
    isAuthenticated: types.boolean,
  })
  .actions(self => ({
    signIn: flow(function*() {
      try {
        // self.isAuthenticated = yield SignInRequest()
      } catch (errors) {
        console.log(errors)
      }
      return self.isAuthenticated
    }),
  }))

export default AuthStore.create(initialState)
