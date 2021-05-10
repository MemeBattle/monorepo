import { getUsers } from '@ioc:CasServices'

export default class UsersController {
  public async index() {
    return getUsers()
  }
}
