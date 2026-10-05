import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router'

import { GuestUpgradeCard } from './GuestUpgradeCard'

const meta: Meta<typeof GuestUpgradeCard> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Guest',
  component: GuestUpgradeCard,
  decorators: [
    Story => (
      <MemoryRouter>
        <div className="flex max-w-[380px] flex-col gap-6">{Story()}</div>
      </MemoryRouter>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof GuestUpgradeCard>

/** The card a guest sees on the dashboard: why to create an account and the link to do it. */
export const CreateAccount: Story = {}
