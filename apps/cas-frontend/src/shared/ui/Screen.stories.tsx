import type { Meta, StoryObj } from '@storybook/react'

import { Alert } from './Alert'
import { Button } from './Button'
import { Section } from './Card'
import { Icon } from './icons'
import { Logo } from './Logo'
import { Hero, Screen, SwitchLink } from './Screen'
import { casScreenStory } from './storybook'
import { TextField } from './TextField'

const meta: Meta<typeof Screen> = {
  ...casScreenStory,
  title: 'CAS / Screen',
  component: Screen,
}
export default meta

type Story = StoryObj<typeof Screen>

/** The auth layout: hero, a form, the switch line, the footer at the bottom. */
export const Centered: Story = {
  render: () => (
    <Screen>
      <Hero title="Вход в MemeBattle" subtitle="Без пароля. Один пасскей для всех игр." />
      <div className="flex flex-col gap-3.5">
        <TextField label="Пасскей" name="passkey" placeholder="Браузер предложит сохранённый" icon={<Icon name="key" />} />
        <Button>Войти с пасскеем</Button>
        <SwitchLink question="Нет аккаунта?">
          <a href="#create-account">Создать</a>
        </SwitchLink>
      </div>
    </Screen>
  ),
}

export const CenteredWithAlert: Story = {
  render: () => (
    <Screen>
      <Hero logoSize={96} title="Создать аккаунт" subtitle="Придумайте имя, остальное сделает браузер. Пароля не будет." />
      <div className="flex flex-col gap-3.5">
        <Alert title="Создание отменено">Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.</Alert>
        <TextField label="Имя" name="displayName" defaultValue="Ада" helper="Его увидят другие игроки." />
        <Button icon={<Icon name="key" />}>Попробовать ещё раз</Button>
        <SwitchLink question="Уже есть аккаунт?">
          <a href="#sign-in">Войти</a>
        </SwitchLink>
      </div>
    </Screen>
  ),
}

/** The dashboard layout: content from the top, the footer still at the bottom. */
export const Top: Story = {
  render: () => (
    <Screen align="top">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">Аккаунт</span>
            <span className="truncate text-[22px] leading-[1.1] font-extrabold">Ада</span>
          </div>
        </div>
        <button type="button" className="flex h-11 shrink-0 items-center gap-1.5 text-sm font-bold text-ink-muted">
          <Icon name="logout" size={18} />
          Выйти
        </button>
      </header>
      <Section title="Пасскеи">
        <div className="px-4 py-3.5 text-base font-extrabold">iPhone Ады</div>
      </Section>
    </Screen>
  ),
}

/** The session check while `/api/me` is in flight. Only the logo pulses: text at half opacity fails the contrast check. */
export const Loading: Story = {
  render: () => (
    <Screen>
      <div className="flex flex-col items-center gap-6">
        <div className="animate-pulse">
          <Logo size={96} />
        </div>
        <p className="text-[15px] font-bold text-ink-muted">Проверяем, кто вы…</p>
      </div>
    </Screen>
  ),
}
