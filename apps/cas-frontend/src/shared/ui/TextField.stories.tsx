import type { Meta, StoryObj } from '@storybook/react'

import { Icon } from './icons'
import { casStory } from './storybook'
import { TextField } from './TextField'

const meta: Meta<typeof TextField> = {
  ...casStory,
  title: 'CAS / TextField',
  component: TextField,
  args: { label: 'Имя', name: 'displayName', placeholder: 'Как вас называть' },
  decorators: [Story => <div className="max-w-[360px]">{Story()}</div>],
}
export default meta

type Story = StoryObj<typeof TextField>

export const Empty: Story = {}

export const Filled: Story = {
  args: { defaultValue: 'Ада' },
}

export const WithHelper: Story = {
  args: {
    defaultValue: 'Ада',
    helper: 'Его увидят другие игроки, и оно же станет подписью пасскея в вашем менеджере.',
  },
}

export const WithError: Story = {
  args: {
    defaultValue: 'Ада Лавлейс, графиня, дочь лорда Байрона, первая в мире программистка',
    helper: 'Его увидят другие игроки.',
    error: 'Слишком длинное имя, максимум 64 символа.',
  },
}

/** The sign-in field: the browser anchors its passkey autofill to it, the user never types into it. */
export const WithIcon: Story = {
  args: {
    label: 'Пасскей',
    name: 'passkey',
    placeholder: 'Браузер предложит сохранённый',
    autoComplete: 'username webauthn',
    icon: <Icon name="key" />,
  },
}
