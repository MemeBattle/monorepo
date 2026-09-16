import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useLoaderData, useRevalidator } from 'react-router'

import { logout } from '#entities/session'
import type { Me } from '#entities/session'
import { Alert, Icon, Logo, Screen } from '#shared/ui'

/** What the alert under the header says when sign-out did not go through; never the raw message. */
const signOutFailure = {
  title: 'Не получилось выйти',
  text: 'Попробуйте ещё раз через минуту.',
}

/** Greets the account by name and lets it sign out; the passkey sections come with #716 and on. */
export const DashboardPage = () => {
  const me = useLoaderData<Me>()
  const revalidator = useRevalidator()

  const [failure, signOut] = useActionState(async (): Promise<typeof signOutFailure | null> => {
    try {
      await logout()
    } catch {
      return signOutFailure
    }
    // The cookie is gone: the loader finds no session and redirects to sign-in.
    await revalidator.revalidate()
    return null
  }, null)

  return (
    <Screen align="top">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">Аккаунт</span>
            <h1 className="truncate text-[22px] leading-[1.1] font-extrabold">{me.displayName}</h1>
          </div>
        </div>
        <form action={signOut}>
          <SignOutButton />
        </form>
      </header>
      {failure && <Alert title={failure.title}>{failure.text}</Alert>}
    </Screen>
  )
}

/** Its own component: `useFormStatus` reads the form it is rendered in. */
const SignOutButton = () => {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 shrink-0 items-center gap-1.5 text-sm font-bold text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:text-ink-hint"
    >
      <Icon name="logout" size={18} />
      Выйти
    </button>
  )
}
