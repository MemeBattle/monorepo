import { Analytics } from '@memebattle/analytics'

export const analytics = new Analytics({ apiKey: import.meta.env.VITE_AMPLITUDE_TOKEN })
