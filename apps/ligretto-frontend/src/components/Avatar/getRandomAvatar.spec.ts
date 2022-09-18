import { getRandomAvatar } from './getRandomAvatar'

describe('Avatar:getRandomAvatar', () => {
  it.each([
    { id: '1', expected: '/src/components/Avatar/assets/u2.svg' },
    { id: '2', expected: '/src/components/Avatar/assets/u3.svg' },
    {
      id: '7',
      expected: '/src/components/Avatar/assets/u8.svg',
    },
    { id: 'a', expected: '/src/components/Avatar/assets/u2.svg' },
    { id: 'b', expected: '/src/components/Avatar/assets/u3.svg' },
    { id: 'c', expected: '/src/components/Avatar/assets/u4.svg' },
    { id: 'd', expected: '/src/components/Avatar/assets/u5.svg' },
    { id: 'e', expected: '/src/components/Avatar/assets/u6.svg' },
    { id: 'f', expected: '/src/components/Avatar/assets/u7.svg' },
    { id: 'g', expected: '/src/components/Avatar/assets/u8.svg' },
    { id: 'h', expected: '/src/components/Avatar/assets/u1.svg' },
    { id: '', expected: '/src/components/Avatar/assets/u1.svg' },
    { id: undefined, expected: '/src/components/Avatar/assets/u1.svg' },
  ])('Should return correct avatar for ids', ({ id, expected }) => {
    expect(getRandomAvatar(id)).toBe(expected)
  })
})
