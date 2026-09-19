import { Button, Card, Icon } from '#shared/ui'

interface PasskeyNudgeProps {
  /** Runs the addition ceremony; the page's form action. */
  action: () => void
  /** While the ceremony runs, from wherever it was started: the button waits and says what to do. */
  pending: boolean
}

/**
 * The card an account with one passkey sees above the sections: why a
 * second one matters (there is no other way back into the account in v1)
 * and the button that adds it. Gone as soon as the list has two.
 */
export const PasskeyNudge = ({ action, pending }: PasskeyNudgeProps) => (
  <Card tone="accent" className="gap-3 p-[18px]">
    <div className="flex items-start gap-3">
      <Icon name="shield" size={24} className="shrink-0" />
      <div className="flex flex-col gap-1">
        <h2 className="text-base leading-tight font-extrabold">Добавьте второй пасскей</h2>
        <p className="text-sm leading-[1.45] font-medium text-ink-muted">
          Если потеряете устройство, второй пасскей это единственный способ вернуться в аккаунт. Восстановления по почте пока нет.
        </p>
      </div>
    </div>
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" pending={pending} pendingLabel="Подтвердите пасскей…" icon={<Icon name="plus" />}>
        Добавить пасскей
      </Button>
      {pending && <p className="text-center text-sm leading-[1.45] font-medium text-ink-muted">Следуйте подсказке браузера или телефона.</p>}
    </form>
  </Card>
)
