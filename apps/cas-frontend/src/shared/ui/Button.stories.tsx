import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useRef } from 'react'

import { Button, SubmitButton } from './Button'
import { Icon } from './icons'
import { casStory } from './storybook'

const meta: Meta<typeof Button> = {
  ...casStory,
  title: 'CAS / Button',
  component: Button,
  args: { children: 'Войти с пасскеем' },
}
export default meta

type Story = StoryObj<typeof Button>

export const Primary: Story = {}

export const PrimaryWithIcon: Story = {
  args: { children: 'Создать пасскей', icon: <Icon name="key" /> },
}

export const Pending: Story = {
  args: { pending: true, pendingLabel: 'Подтвердите пасскей…' },
}

export const Disabled: Story = {
  args: { disabled: true, children: 'Добавить пасскей', icon: <Icon name="plus" /> },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Отмена' },
}

export const Danger: Story = {
  args: { variant: 'danger', children: 'Удалить', icon: <Icon name="trash" /> },
}

/** A form whose action never settles: the button reads the pending state from `useFormStatus`. */
const SubmittedForm = () => {
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    form.current?.requestSubmit()
  }, [])
  return (
    <form ref={form} action={() => new Promise<void>(() => {})} className="flex flex-col gap-3.5">
      <SubmitButton pendingLabel="Подтвердите пасскей…">Войти с пасскеем</SubmitButton>
    </form>
  )
}

export const SubmitInPendingForm: Story = {
  render: () => <SubmittedForm />,
}

export const AllStates: Story = {
  render: () => (
    <div className="flex max-w-[360px] flex-col gap-3">
      <Button>Войти с пасскеем</Button>
      <Button icon={<Icon name="key" />}>Создать пасскей</Button>
      <Button pending pendingLabel="Подтвердите пасскей…">
        Войти с пасскеем
      </Button>
      <Button disabled icon={<Icon name="plus" />}>
        Добавить пасскей
      </Button>
      <Button variant="danger" icon={<Icon name="trash" />}>
        Удалить
      </Button>
      <Button variant="secondary">Отмена</Button>
    </div>
  ),
}
