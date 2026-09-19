import type { Meta, StoryObj } from '@storybook/react'

import { ApiError } from '#shared/api/request'
import { EmailSection } from './EmailSection'

const never = () => new Promise<void>(() => {})

const meta: Meta<typeof EmailSection> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Email',
  component: EmailSection,
  decorators: [Story => <div className="max-w-[380px]">{Story()}</div>],
  args: { email: null, onSave: never },
}
export default meta

type Story = StoryObj<typeof EmailSection>

/** No address yet: what it will be for, and "Добавить" in the title row. */
export const Empty: Story = {}

/** An address, stored unverified, with the pencil to change it. */
export const Set: Story = {
  args: { email: 'ada@mems.fun' },
}

/** The form in place of the row, with the way to clear the address. */
export const Editing: Story = {
  args: { email: 'ada@mems.fun' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Изменить почту' }))
  },
}

/** The form opened from the empty state: no address to clear. */
export const Adding: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Добавить почту' }))
  },
}

/** The server refused the address (`invalid_email`): the field keeps it and says why. */
export const Invalid: Story = {
  args: { onSave: () => Promise.reject(new ApiError(400, 'invalid_email', 'Invalid email: must contain a single @')) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Добавить почту' }))
    await userEvent.type(canvas.getByLabelText('Почта'), 'ada@mems@fun')
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }))
  },
}

/** The request did not go through for another reason: the form stays with its own words. */
export const Failed: Story = {
  args: { email: 'ada@mems.fun', onSave: () => Promise.reject(new TypeError('Failed to fetch')) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Изменить почту' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Удалить' }))
  },
}
