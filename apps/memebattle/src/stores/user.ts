import { types, flow } from 'mobx-state-tree'
const User = types.model('User', {
  id: types.number,
  name: types.string,
  secondName: types.string,
  login: types.string,
  password: types.string,
})
const UserStore = types
  .model('UserStore', {
    user: types.map(User),
  })
  .actions(self => ({
    getUser: flow(function*() {
      try {
        // self.user = yield getUserRequest()
      } catch (errors) {
        console.log(errors)
      }
      return self.user
    }),
  }))
