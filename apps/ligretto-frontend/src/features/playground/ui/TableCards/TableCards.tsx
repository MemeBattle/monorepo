import { Children, type PropsWithChildren, type Ref } from 'react'
import { Box } from '@memebattle/ui'

import { styled } from '@mui/material/styles'

const StyledGrid = styled('div')(({ theme }) => ({
  gridAutoRows: 'min-content',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '0.5rem',
  [theme.breakpoints.down('lg')]: {
    gap: '0.375rem',
  },
  [theme.breakpoints.down('md')]: {
    gap: '0.3rem',
  },
  [theme.breakpoints.down('sm')]: {
    gap: '0.25rem',
  },
}))

export const TableCards = ({ children, ref }: PropsWithChildren<{ ref?: Ref<HTMLDivElement> }>) => (
  <Box ref={ref} data-card-interaction-element display="flex" justifyContent="center" alignItems="center" flex={1}>
    <StyledGrid>
      {Children.map(children, (child, index) => (
        <Box key={index}>{child}</Box>
      ))}
    </StyledGrid>
  </Box>
)
