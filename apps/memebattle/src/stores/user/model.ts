import { types, flow, Instance } from 'mobx-state-tree'

const initialState = {
  user: null,
  isFetching: true,
}

const User = types.model('User', {
  id: types.identifier,
  name: types.string,
  secondName: types.string,
})
export interface IUser extends Instance<typeof User> {}

const UserStore = types
  .model('UserStore', {
    user: types.maybeNull(User),
    isFetching: types.boolean,
  })
  .actions(self => ({
    fetchUser: flow(function*() {
      try {
        // self.user = yield getUserRequest()
      } catch (errors) {
        // console.log(errors)
      }
      return self.user
    }),
    setUser(user: IUser) {
      self.user = user
    },
  }))

export default types.optional(UserStore, initialState)
