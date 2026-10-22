import { test } from '@japa/runner'
import User from '#models/User'

test.group('User.mergeWithCasUser', () => {
  test('CAS user fields override model fields', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.accountType = 'full'

    const casUser = { _id: 'cas-id', username: 'casname', email: 'cas@example.com' }
    const result = user.mergeWithCasUser(casUser)

    assert.equal(result.username, 'casname')
    assert.equal(result.email, 'cas@example.com')
  })

  test('_id from CAS user is not included in result', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.accountType = 'full'

    const casUser = { _id: 'cas-id', username: 'casname' }
    const result = user.mergeWithCasUser(casUser)

    assert.notProperty(result, '_id')
  })

  test('with undefined CAS user — returns only serialized model', ({ assert }) => {
    const user = new User()
    user.casId = 'local-id'
    user.accountType = 'guest'

    const result = user.mergeWithCasUser(undefined)

    assert.equal(result.casId, 'local-id')
    assert.isTrue(result.isTemporary)
    assert.notProperty(result, '_id')
  })
})

test.group('User.isTemporary', () => {
  test('a guest serializes as temporary', ({ assert }) => {
    const user = new User()
    user.casId = 'guest-id'
    user.accountType = 'guest'

    assert.isTrue(user.isTemporary)
    assert.isTrue(user.serialize().isTemporary)
  })

  test('a full account does not', ({ assert }) => {
    const user = new User()
    user.casId = 'full-id'
    user.accountType = 'full'

    assert.isFalse(user.isTemporary)
    assert.isFalse(user.serialize().isTemporary)
  })

  test('the profile snapshot is serialized alongside it', ({ assert }) => {
    const user = new User()
    user.casId = 'full-id'
    user.accountType = 'full'
    user.displayName = 'Some Name'
    user.avatarUrl = 'https://example.com/a.png'

    const serialized = user.serialize()

    assert.equal(serialized.accountType, 'full')
    assert.equal(serialized.displayName, 'Some Name')
    assert.equal(serialized.avatarUrl, 'https://example.com/a.png')
  })
})
