import { test } from '@japa/runner'
import { isOriginAllowed } from '#helpers/allowedOrigin'

test.group('isOriginAllowed', () => {
  test('the production origin — allowed in either environment', ({ assert }) => {
    assert.isTrue(isOriginAllowed('https://ligretto.app', 'production'))
    assert.isTrue(isOriginAllowed('https://ligretto.app', 'development'))
  })

  test('the development frontends — allowed outside production, on any port', ({ assert }) => {
    assert.isTrue(isOriginAllowed('http://localhost:5173', 'development'))
    assert.isTrue(isOriginAllowed('http://localhost:5174', 'development'))
    assert.isTrue(isOriginAllowed('http://127.0.0.1:5173', 'development'))
    assert.isTrue(isOriginAllowed('http://localhost', 'development'))
  })

  test('a host that merely starts with localhost — refused', ({ assert }) => {
    assert.isFalse(isOriginAllowed('http://localhost.attacker.example', 'development'))
    assert.isFalse(isOriginAllowed('http://localhost.attacker.example:5173', 'development'))
  })

  test('a host that merely starts with the production origin — refused', ({ assert }) => {
    assert.isFalse(isOriginAllowed('https://ligretto.app.evil.example', 'development'))
    assert.isFalse(isOriginAllowed('https://ligretto.app.evil.example', 'production'))
  })

  test('https or a path on a development origin — refused', ({ assert }) => {
    assert.isFalse(isOriginAllowed('https://localhost:5173', 'development'))
    assert.isFalse(isOriginAllowed('http://localhost:5173/anything', 'development'))
    assert.isFalse(isOriginAllowed('http://user@localhost:5173', 'development'))
  })

  test('an origin that does not parse — refused', ({ assert }) => {
    assert.isFalse(isOriginAllowed('localhost:5173', 'development'))
    assert.isFalse(isOriginAllowed('null', 'development'))
    assert.isFalse(isOriginAllowed('', 'development'))
  })

  test('in production every localhost form is refused', ({ assert }) => {
    assert.isFalse(isOriginAllowed('http://localhost:5173', 'production'))
    assert.isFalse(isOriginAllowed('http://localhost', 'production'))
    assert.isFalse(isOriginAllowed('http://127.0.0.1:5173', 'production'))
  })
})
