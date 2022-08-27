import { Analytics } from '@memebattle/analytics'
import { AMPLITUDE_TOKEN } from 'config'

export const analytics = new Analytics({ apiKey: AMPLITUDE_TOKEN })
