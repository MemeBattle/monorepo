import { test } from '@japa/runner'
import User from '#models/User'

test.group('User.mergeWithCasUser', () => {
  test('CAS user fields override model fields', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.isTemporary = false

    const casUser = { _id: 'cas-id', username: 'casname', email: 'cas@example.com' }
    const result = user.mergeWithCasUser(casUser)

    assert.equal(result.username, 'casname')
    assert.equal(result.email, 'cas@example.com')
  })

  test('_id from CAS user is not included in result', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.isTemporary = false

    const casUser = { _id: 'cas-id', username: 'casname' }
    const result = user.mergeWithCasUser(casUser)

    assert.notProperty(result, '_id')
  })

  test('with undefined CAS user — returns only serialized model', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.isTemporary = true

    const result = user.mergeWithCasUser(undefined)

    assert.equal(result.casId, 'local-id')
    assert.isTrue(result.isTemporary)
    assert.notProperty(result, '_id')
  })
})
