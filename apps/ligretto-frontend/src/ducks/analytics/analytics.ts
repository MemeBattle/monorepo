import { Analytics } from '@memebattle/analytics'

export const analytics = new Analytics({ apiKey: process.env.REACT_APP_AMPLITUDE_TOKEN })
