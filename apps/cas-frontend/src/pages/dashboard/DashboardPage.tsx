import { useLoaderData } from 'react-router'

import type { Me } from '#entities/session'
import { Logo, Screen } from '#shared/ui'

/** Greets the account by name; the passkey sections come with #716 and on. */
export const DashboardPage = () => {
  const me = useLoaderData<Me>()

  return (
    <Screen align="top">
      <header className="flex items-center gap-3">
        <Logo size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">Аккаунт</span>
          <h1 className="truncate text-[22px] leading-[1.1] font-extrabold">{me.displayName}</h1>
        </div>
      </header>
    </Screen>
  )
}
