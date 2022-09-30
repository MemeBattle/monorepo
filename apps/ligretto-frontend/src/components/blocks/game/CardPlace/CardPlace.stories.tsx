import { CardPlace } from './CardPlace'
import { Stack } from '@memebattle/ui'

export default {
  title: 'Ligretto / CardPlace',
}

export const DefaultView = () => (
  <Stack spacing={2} direction="row">
    <CardPlace size="small" />
    <CardPlace size="medium" />
    <CardPlace size="large" />
  </Stack>
)
