import type { Meta, StoryObj } from '@storybook/react'

import { Alert } from '#shared/ui'
import { addPasskeyFailures } from './addPasskeyFailure'
import { PasskeyNudge } from './PasskeyNudge'

const meta: Meta<typeof PasskeyNudge> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Add passkey',
  component: PasskeyNudge,
  decorators: [Story => <div className="flex max-w-[380px] flex-col gap-6">{Story()}</div>],
  args: { action: () => {}, pending: false },
}
export default meta

type Story = StoryObj<typeof PasskeyNudge>

/** The one-passkey nudge above the dashboard sections. */
export const Nudge: Story = {}

/** The ceremony is running: the button waits and says what to do. */
export const Pending: Story = {
  args: { pending: true },
}

/** The authenticator, or the server, refused: this device already holds a passkey for the account. */
export const AlreadyOnThisDevice: Story = {
  render: args => (
    <>
      <PasskeyNudge {...args} />
      <Alert title={addPasskeyFailures.alreadyOnThisDevice.title}>{addPasskeyFailures.alreadyOnThisDevice.text}</Alert>
    </>
  ),
}

/** The prompt was closed or timed out: nothing is broken, the button is still there. */
export const Cancelled: Story = {
  render: args => (
    <>
      <PasskeyNudge {...args} />
      <Alert title={addPasskeyFailures.cancelled.title}>{addPasskeyFailures.cancelled.text}</Alert>
    </>
  ),
}
