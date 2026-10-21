import { test } from '@japa/runner'
import User from '#models/User'

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
