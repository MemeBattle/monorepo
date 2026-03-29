import { test } from '@japa/runner'
import UserModel from '#models/User'
import { mockCasUser, activeCasMock, bindCasMock, resetCasMock } from '../../../tests/helpers/casMock.js'

test.group('GET /api/users', group => {
  group.setup(() => bindCasMock())
  group.each.setup(() => resetCasMock())

  test('with valid ids — returns merged users', async ({ client, assert }) => {
    await UserModel.firstOrCreate({ casId: mockCasUser._id }, { isTemporary: false })

    const response = await client.get('/api/users').qs({ ids: [mockCasUser._id] })
    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body)
    assert.equal(body.length, 1)
    assert.equal(body[0].casId, mockCasUser._id)
    assert.equal(body[0].username, mockCasUser.username)
  })

  test('with empty ids array — returns 422 (same as no ids over HTTP)', async ({ client }) => {
    const response = await client.get('/api/users').qs({ ids: [] })
    response.assertStatus(422)
  })

  test('without ids — returns 422 validation error', async ({ client }) => {
    const response = await client.get('/api/users')
    response.assertStatus(422)
  })

  test('CAS getUsers returns error — returns CAS error code', async ({ client }) => {
    activeCasMock.getUsers = async () => ({ success: false, error: { errorCode: 503, message: 'CAS error' } })
    const response = await client.get('/api/users').qs({ ids: [mockCasUser._id] })
    response.assertStatus(503)
  })
})
