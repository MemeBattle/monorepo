import { CardPositions } from '../card-model'
import { MAX_CARDS_ON_TABLE, TABLE_CARDS_PREFIX } from 'config'

describe('CardPositions', () => {
  it(`Should contain MAX_CARDS_ON_TABLE: ${MAX_CARDS_ON_TABLE} table cards`, () => {
    let success = true
    for (let i = 0; i < MAX_CARDS_ON_TABLE; i++) {
      if (!Object(CardPositions).hasOwnProperty(`${TABLE_CARDS_PREFIX}${i}`)) {
        success = false
        break
      }
    }
    expect(success).toBe(true)
  })
})
