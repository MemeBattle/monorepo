import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './Button'
import { Card, Section } from './Card'
import { Icon } from './icons'

const meta: Meta<typeof Card> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Card',
  component: Card,
  decorators: [Story => <div className="max-w-[380px]">{Story()}</div>],
}
export default meta

type Story = StoryObj<typeof Card>

const Row = ({ icon, title, text }: { icon: 'key' | 'mail'; title: string; text: string }) => (
  <div className="flex items-center gap-3 px-4 py-3.5">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-accent-tint text-ink">
      <Icon name={icon} />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-base leading-tight font-extrabold">{title}</span>
      <span className="text-[13px] leading-snug font-medium text-ink-muted">{text}</span>
    </div>
  </div>
)

export const Surface: Story = {
  render: () => (
    <Card>
      <Row icon="key" title="iPhone Ады" text="Создан 12 сентября · Использован сегодня" />
    </Card>
  ),
}

/** The tone of the nudge card; the nudge itself is `pages/dashboard/PasskeyNudge` and has its own stories. */
export const Accent: Story = {
  render: () => (
    <Card tone="accent" className="gap-3 p-[18px]">
      <div className="flex items-start gap-3">
        <Icon name="shield" size={24} />
        <div className="flex flex-col gap-1">
          <span className="text-base leading-tight font-extrabold">Заголовок карточки</span>
          <span className="text-sm leading-[1.45] font-medium text-ink-muted">Текст, который объясняет, зачем нужна кнопка под ним.</span>
        </div>
      </div>
      <Button icon={<Icon name="plus" />}>Действие</Button>
    </Card>
  ),
}

export const TitledSection: Story = {
  render: () => (
    <Section title="Пасскеи">
      <Row icon="key" title="iPhone Ады" text="Создан 12 сентября · Использован сегодня" />
      <Row icon="key" title="Ключ на работе" text="Создан вчера · Не использовался" />
    </Section>
  ),
}

export const SectionWithAction: Story = {
  render: () => (
    <Section
      title="Пасскеи"
      action={
        <button type="button" className="flex h-11 items-center gap-1 text-sm font-bold text-ink-muted">
          <Icon name="plus" size={18} />
          Добавить
        </button>
      }
    >
      <Row icon="key" title="iPhone Ады" text="Создан 12 сентября · Использован сегодня" />
      <Row icon="mail" title="ada@mems.fun" text="Не подтверждена. Подтверждение появится позже." />
    </Section>
  ),
}
