import { types, flow } from 'mobx-state-tree'
const Model = types.model('Model', {
  id: types.number,
  name: types.string,
  secondName: types.string,
  login: types.string,
  password: types.string,
})
const UserStore = types
  .model('UserStore', {
    user: types.maybeNull(types.map(Model)),
  })
  .actions(self => ({
    getUser: flow(function*() {
      try {
        // self.user = yield getUserRequest()
      } catch (errors) {
        // console.log(errors)
      }
      return self.user
    }),
  }))

const initialState = { user: null }

export default UserStore.create(initialState)
