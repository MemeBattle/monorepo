import type { Meta, StoryObj } from '@storybook/react'

import { Section } from '#shared/ui'
import { DeletePasskeyDialog } from './DeletePasskeyDialog'
import { PasskeyRow } from './PasskeyRow'

const passkeys = [
  { id: 'p1', name: 'Пасскей', createdAt: '2026-09-12T10:00:00Z', lastUsedAt: null },
  { id: 'p2', name: 'iPhone Ады', createdAt: '2025-12-31T12:00:00Z', lastUsedAt: '2026-09-19T10:00:00Z' },
]

const never = () => new Promise<void>(() => {})

const meta: Meta<typeof DeletePasskeyDialog> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Delete passkey',
  component: DeletePasskeyDialog,
  decorators: [Story => <div className="max-w-[380px]">{Story()}</div>],
}
export default meta

type Story = StoryObj<typeof DeletePasskeyDialog>

/** The sheet over the list, as the trash button opens it. */
export const Sheet: Story = {
  render: () => (
    <>
      <Section title="Пасскеи">
        <ul>
          {passkeys.map(passkey => (
            <PasskeyRow key={passkey.id} passkey={passkey} deletable deleteFailure={null} onRename={never} onDelete={never} />
          ))}
        </ul>
      </Section>
      <DeletePasskeyDialog passkey={passkeys[1]} onDelete={never} onClose={() => {}} />
    </>
  ),
}

/** The only passkey: delete is off, with the reason under the row. */
export const LastPasskey: Story = {
  render: () => (
    <Section title="Пасскеи">
      <ul>
        <PasskeyRow passkey={passkeys[0]} deletable={false} deleteFailure={null} onRename={never} onDelete={never} />
      </ul>
    </Section>
  ),
}

/** A delete the server refused for a reason other than the last-passkey rule. */
export const Failed: Story = {
  render: () => (
    <Section title="Пасскеи">
      <ul>
        {passkeys.map((passkey, index) => (
          <PasskeyRow key={passkey.id} passkey={passkey} deletable deleteFailure={index === 1 ? 'failed' : null} onRename={never} onDelete={never} />
        ))}
      </ul>
    </Section>
  ),
}
