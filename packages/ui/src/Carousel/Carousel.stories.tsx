import { Carousel, CarouselSlides, CarouselControls, CarouselControl } from './Carousel'
import { Box } from '../Box'
import type { ReactNode } from 'react'

export default {
  title: 'UI / Carousel',
  component: Carousel,
}

const items = ['1', '2', '3']

const Square = ({ children }: { children: ReactNode }) => (
  <Box display="flex" border="1px solid" borderColor="white" width="100%" background={'red'}>
    {children}
  </Box>
)

const Control = ({ isActive, children }: { isActive?: boolean; children: ReactNode }) => <Box color={isActive ? 'yellow' : 'black'}>{children}</Box>

export const Default = () => (
  <Box height="15rem">
    <Carousel>
      <CarouselSlides>
        {items.map(item => (
          <Square key={item}>{item}</Square>
        ))}
      </CarouselSlides>
      <CarouselControls>
        {items.map(item => (
          <CarouselControl key={item}>
            <Control>{item}</Control>
          </CarouselControl>
        ))}
      </CarouselControls>
    </Carousel>
  </Box>
)
