import { describe, expect, it } from 'vitest'
import { getRandomAvatar } from './getRandomAvatar'

describe('Avatar:getRandomAvatar', () => {
  it.each([
    { id: '1', expected: '/src/shared/ui/Avatar/assets/u2.svg?no-inline' },
    { id: '2', expected: '/src/shared/ui/Avatar/assets/u3.svg?no-inline' },
    {
      id: '7',
      expected: '/src/shared/ui/Avatar/assets/u8.svg?no-inline',
    },
    { id: 'a', expected: '/src/shared/ui/Avatar/assets/u2.svg?no-inline' },
    { id: 'b', expected: '/src/shared/ui/Avatar/assets/u3.svg?no-inline' },
    { id: 'c', expected: '/src/shared/ui/Avatar/assets/u4.svg?no-inline' },
    { id: 'd', expected: '/src/shared/ui/Avatar/assets/u5.svg?no-inline' },
    { id: 'e', expected: '/src/shared/ui/Avatar/assets/u6.svg?no-inline' },
    { id: 'f', expected: '/src/shared/ui/Avatar/assets/u7.svg?no-inline' },
    { id: 'g', expected: '/src/shared/ui/Avatar/assets/u8.svg?no-inline' },
    { id: 'h', expected: '/src/shared/ui/Avatar/assets/u1.svg?no-inline' },
    { id: '', expected: '/src/shared/ui/Avatar/assets/u1.svg?no-inline' },
    { id: undefined, expected: '/src/shared/ui/Avatar/assets/u1.svg?no-inline' },
  ])('Should return correct avatar for ids', ({ id, expected }) => {
    expect(getRandomAvatar(id)).toBe(expected)
  })
})
