import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { mockCasUser, mockTemporaryUser, mockTemporaryToken, activeCasMock, bindCasMock, resetCasMock } from '../../../tests/helpers/casMock.js'

test.group('POST /api/auth/me', group => {
  group.setup(() => bindCasMock())
  group.each.setup(() => resetCasMock())
  group.each.teardown(() => testUtils.db().truncate())

  test('without token — creates temporary user and returns token', async ({ client, assert }) => {
    const response = await client.post('/api/auth/me')
    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.user)
    assert.exists(body.token)
    assert.equal(body.token, mockTemporaryToken)
    assert.equal(body.user.casId, mockTemporaryUser._id)
    assert.isTrue(body.user.isTemporary)
  })

  test('with valid token — calls getMe and returns user', async ({ client, assert }) => {
    const response = await client.post('/api/auth/me').json({ token: 'valid-token' })
    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.user)
    assert.equal(body.token, 'valid-token')
    assert.equal(body.user.casId, mockCasUser._id)
  })

  test('with token, CAS returns 403 — falls back to createTemporaryToken', async ({ client, assert }) => {
    activeCasMock.getMe = async () => ({ success: false, error: { errorCode: 403, message: 'Forbidden' } })
    const response = await client.post('/api/auth/me').json({ token: 'expired-token' })
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.token, mockTemporaryToken)
    assert.isTrue(body.user.isTemporary)
  })

  test('with token, CAS returns 401 — returns 401 error', async ({ client }) => {
    activeCasMock.getMe = async () => ({ success: false, error: { errorCode: 401, message: 'Unauthorized' } })
    const response = await client.post('/api/auth/me').json({ token: 'bad-token' })
    response.assertStatus(401)
  })

  test('createTemporaryToken fails — returns CAS error code', async ({ client }) => {
    activeCasMock.createTemporaryToken = async () => ({ success: false, error: { errorCode: 503, message: 'CAS unavailable' } })
    const response = await client.post('/api/auth/me')
    response.assertStatus(503)
  })
})
