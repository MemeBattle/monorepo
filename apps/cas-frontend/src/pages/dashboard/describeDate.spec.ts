import { describe, expect, it } from 'vitest'

import { describeDate } from './describeDate'

const now = new Date(2026, 8, 16, 10, 30)

describe('describeDate', () => {
  it('says today for any time of the current day', () => {
    expect(describeDate(new Date(2026, 8, 16, 0, 5).toISOString(), now)).toBe('сегодня')
    expect(describeDate(new Date(2026, 8, 16, 23, 59).toISOString(), now)).toBe('сегодня')
  })

  it('says yesterday across midnight, not across 24 hours', () => {
    expect(describeDate(new Date(2026, 8, 15, 23, 0).toISOString(), now)).toBe('вчера')
    expect(describeDate(new Date(2026, 8, 15, 0, 0).toISOString(), now)).toBe('вчера')
  })

  it('names the day within the current year', () => {
    expect(describeDate(new Date(2026, 8, 12).toISOString(), now)).toBe('12 сентября')
    expect(describeDate(new Date(2026, 0, 1).toISOString(), now)).toBe('1 января')
  })

  it('adds the year beyond the current one', () => {
    expect(describeDate(new Date(2025, 11, 31).toISOString(), now)).toBe('31 декабря 2025 г.')
  })
})
