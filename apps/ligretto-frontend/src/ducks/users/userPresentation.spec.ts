import { describe, expect, it } from 'vitest'

import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

import { GUEST_LABEL, userAvatarUrl, userLabel } from './userPresentation'

describe('userLabel', () => {
  it('labels a guest with the app label', () => {
    expect(userLabel({ accountType: 'guest', displayName: null })).toBe(GUEST_LABEL)
  })

  it('shows the name of a full account', () => {
    expect(userLabel({ accountType: 'full', displayName: 'Ann' })).toBe('Ann')
  })

  it('does not call a full account without a name a guest', () => {
    expect(userLabel({ accountType: 'full', displayName: null })).toBe('Player')
  })
})

describe('userAvatarUrl', () => {
  it('uses the avatar CAS released', () => {
    expect(userAvatarUrl({ casId: 'sub-1', avatarUrl: 'https://cas.example/a.png' })).toBe('https://cas.example/a.png')
  })

  it('falls back to the generated avatar by id', () => {
    expect(userAvatarUrl({ casId: 'sub-1', avatarUrl: null })).toBe(getRandomAvatar('sub-1'))
  })
})
