import { Card } from './Card'
import { CardColors } from '@memebattle/ligretto-shared'
import { Box } from '@mui/material'

export default {
  title: 'Ligretto-ui / Card',
  component: Card,
}

export const CardsColor = () => (
  <Box justifyContent="space-evenly" display="flex" height={'10rem'}>
    <Card color={CardColors.blue} value={1} />
    <Card color={CardColors.red} value={2} />
    <Card color={CardColors.yellow} value={3} />
    <Card color={CardColors.green} value={10} />
    <Card color={CardColors.empty} />
    <Card color={CardColors.red} disabled />
    <Card color={CardColors.red} hidden />
  </Box>
)
