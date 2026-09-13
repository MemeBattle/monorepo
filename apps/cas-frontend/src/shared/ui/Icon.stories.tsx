import type { Meta, StoryObj } from '@storybook/react'

import { Icon, iconNames } from './icons'

const meta: Meta<typeof Icon> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Icon',
  component: Icon,
  args: { name: 'key', size: 24 },
}
export default meta

type Story = StoryObj<typeof Icon>

export const Single: Story = {}

export const All: Story = {
  render: () => (
    <ul className="grid max-w-[420px] grid-cols-3 gap-3">
      {iconNames.map(name => (
        <li key={name} className="flex items-center gap-3 rounded-chip border-2 border-line bg-surface px-3 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-accent-tint text-ink">
            <Icon name={name} size={24} />
          </span>
          <span className="text-[13px] font-bold text-ink-muted">{name}</span>
        </li>
      ))}
    </ul>
  ),
}

/** Icons take the text colour: muted on inline buttons, hint when disabled, danger in alerts. */
export const Colours: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Icon name="pencil" size={24} className="text-ink-muted" />
      <Icon name="trash" size={24} className="text-ink-hint" />
      <Icon name="alert" size={24} className="text-danger" />
      <Icon name="check" size={24} className="text-ink" />
    </div>
  ),
}
