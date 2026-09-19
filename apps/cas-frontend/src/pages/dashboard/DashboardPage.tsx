import { useActionState, useOptimistic } from 'react'
import { useFormStatus } from 'react-dom'
import { useLoaderData, useRevalidator } from 'react-router'

import { renamePasskey } from '#entities/passkey'
import type { Passkey } from '#entities/passkey'
import { logout } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { Alert, Icon, Logo, Screen, Section } from '#shared/ui'
import type { DashboardData } from './loadDashboard'
import { PasskeyRow } from './PasskeyRow'

/** What the alert under the header says when sign-out did not go through; never the raw message. */
const signOutFailure = {
  title: 'Не получилось выйти',
  text: 'Попробуйте ещё раз через минуту.',
}

/** The list with a rename the server has not confirmed yet applied to it. */
const withRenamed = (passkeys: Passkey[], renamed: Pick<Passkey, 'id' | 'name'>) =>
  passkeys.map(passkey => (passkey.id === renamed.id ? { ...passkey, name: renamed.name } : passkey))

/** The account by name, its passkeys, and the way out. Deleting and adding passkeys, and the email, come with #718 and on. */
export const DashboardPage = () => {
  const { me, passkeys } = useLoaderData<DashboardData>()
  const revalidator = useRevalidator()
  // React shows the renamed list while the row's action runs and goes back to the loader's once it settles.
  const [shownPasskeys, showRenamed] = useOptimistic(passkeys, withRenamed)

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

  const rename = async (id: string, name: string) => {
    showRenamed({ id, name })
    try {
      await renamePasskey(id, name)
    } catch (error) {
      // Deleted in another tab: the list is stale, not the name. The reload below takes the row away.
      if (!(isApiError(error) && error.code === 'passkey_not_found')) {
        throw error
      }
    }
    // The action stays pending until the loader has the new name, so the optimistic one never flickers back.
    await revalidator.revalidate()
  }

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
      <Section title="Пасскеи">
        <ul>
          {shownPasskeys.map(passkey => (
            <PasskeyRow key={passkey.id} passkey={passkey} onRename={name => rename(passkey.id, name)} />
          ))}
        </ul>
      </Section>
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
