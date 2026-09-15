import type { Meta, StoryObj } from '@storybook/react'

import { Alert } from './Alert'

const meta: Meta<typeof Alert> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Alert',
  component: Alert,
  decorators: [Story => <div className="max-w-[360px]">{Story()}</div>],
}
export default meta

type Story = StoryObj<typeof Alert>

export const Cancelled: Story = {
  args: {
    title: 'Вход отменён',
    children: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
  },
}

export const WithLink: Story = {
  args: {
    title: 'Этот пасскей здесь не зарегистрирован',
    children: (
      <>
        Возможно, он от другого сайта, или аккаунта ещё нет.{' '}
        <a href="#create-account" className="font-extrabold underline underline-offset-[3px]">
          Создать аккаунт
        </a>
      </>
    ),
  },
}

export const LongText: Story = {
  args: {
    title: 'Не получилось создать пасскей',
    children:
      'Этот ключ или браузер не умеет хранить пасскеи с проверкой владельца. Подойдут Touch ID, Face ID, Windows Hello или менеджер паролей на телефоне.',
  },
}
