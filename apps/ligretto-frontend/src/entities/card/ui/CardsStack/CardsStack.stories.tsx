import type { Meta, StoryObj } from '@storybook/react'
import { CardColors } from '@memebattle/ligretto-shared'
import { Box } from '@memebattle/ui'

import { CardsStack } from './CardsStack'

const meta: Meta<typeof CardsStack> = {
  title: 'Ligretto / CardsStack',
  component: CardsStack,
  args: {
    stackDeckCards: [
      { value: 9, color: CardColors.blue },
      { value: 2, color: CardColors.blue },
      { value: 6, color: CardColors.green },
    ],
    isStackDeckHidden: true,
    isStackOpenDeckSelected: false,
    isStackOpenDeckDarkened: false,
    onStackDeckCardClick: () => {},
    onStackOpenDeckCardClick: () => {},
  },
  decorators: [
    Story => (
      <Box sx={{ m: 2, display: 'inline-block', background: '#3d9970', p: 4 }}>
        <Story />
      </Box>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof CardsStack>

/** The face-down deck shows the uniform card back; the open place is still empty. */
export const Default: Story = {}

/** A flipped card lies on the open pile next to the face-down deck. */
export const WithOpenCard: Story = {
  args: {
    stackOpenDeckCard: { value: 9, color: CardColors.blue },
    stackDeckCards: [
      { value: 2, color: CardColors.blue },
      { value: 6, color: CardColors.green },
    ],
  },
}

/** The deck place is highlighted to draw the player's attention. */
export const DeckHighlighted: Story = {
  args: {
    isStackDeckHighlighted: true,
  },
}

/** The open card is selected (e.g. picked via hotkey). */
export const OpenCardSelected: Story = {
  args: {
    stackOpenDeckCard: { value: 9, color: CardColors.blue },
    stackDeckCards: [{ value: 6, color: CardColors.green }],
    isStackOpenDeckSelected: true,
  },
}

/** The face-down deck is exhausted: the reshuffle icon hints that a click turns the open pile over. */
export const EmptyDeckReshuffle: Story = {
  args: {
    stackDeckCards: [],
    stackOpenDeckCard: { value: 6, color: CardColors.green },
  },
}
