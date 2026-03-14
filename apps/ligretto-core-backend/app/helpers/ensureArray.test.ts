import { test } from '@japa/runner'
import { ensureArray } from '#helpers/ensureArray'

test.group('ensureArray', () => {
  test('string → single-element array', ({ assert }) => {
    assert.deepEqual(ensureArray('abc'), ['abc'])
  })

  test('array → same array', ({ assert }) => {
    assert.deepEqual(ensureArray(['a', 'b']), ['a', 'b'])
  })

  test('undefined → undefined', ({ assert }) => {
    assert.isUndefined(ensureArray(undefined))
  })

  test('null → undefined', ({ assert }) => {
    assert.isUndefined(ensureArray(null))
  })
})
