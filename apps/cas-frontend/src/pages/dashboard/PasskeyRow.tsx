import type { Passkey } from '#entities/passkey'
import { Icon } from '#shared/ui'
import { describeDate } from './describeDate'

/** "Создан 12 сентября · Использован сегодня"; a passkey that never signed in says so. */
const describe = ({ createdAt, lastUsedAt }: Passkey) =>
  `Создан ${describeDate(createdAt)} · ${lastUsedAt ? `Использован ${describeDate(lastUsedAt)}` : 'Не использовался'}`

/** One passkey in the list: the key chip, the name, when it was made and last used. Rename and delete come with #717 and #718. */
export const PasskeyRow = ({ passkey }: { passkey: Passkey }) => (
  <li className="flex items-center gap-3 px-4 py-3.5">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-accent-tint text-ink">
      <Icon name="key" />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-base leading-tight font-extrabold">{passkey.name}</span>
      <span className="text-[13px] leading-snug font-medium text-ink-muted">{describe(passkey)}</span>
    </div>
  </li>
)
