import type { Meta, StoryObj } from '@storybook/react'
import type { ReactNode } from 'react'
import { Carousel, CarouselSlides, CarouselControls, CarouselControl } from './Carousel'
import { Box } from '../Box'

const meta: Meta<typeof Carousel> = {
  title: 'UI / Carousel',
  component: Carousel,
}
export default meta

type Story = StoryObj<typeof Carousel>

const items = ['1', '2', '3']

const Square = ({ children }: { children: ReactNode }) => (
  <Box display="flex" border="1px solid" borderColor="white" width="100%" background="red">
    {children}
  </Box>
)

const Control = ({ isActive, children }: { isActive?: boolean; children: ReactNode }) => <Box color={isActive ? 'yellow' : 'black'}>{children}</Box>

export const Default: Story = {
  render: () => (
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
  ),
}
