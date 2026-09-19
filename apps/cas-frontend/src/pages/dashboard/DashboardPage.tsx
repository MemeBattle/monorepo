import { useActionState, useOptimistic, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useLoaderData, useRevalidator } from 'react-router'

import { deletePasskey, renamePasskey } from '#entities/passkey'
import type { Passkey } from '#entities/passkey'
import { logout } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { Alert, Icon, Logo, Screen, Section } from '#shared/ui'
import type { DashboardData } from './loadDashboard'
import { PasskeyRow } from './PasskeyRow'
import type { DeleteFailure } from './PasskeyRow'

/** What the alert under the header says when sign-out did not go through; never the raw message. */
const signOutFailure = {
  title: 'Не получилось выйти',
  text: 'Попробуйте ещё раз через минуту.',
}

/** A rename or a delete the server has not confirmed yet. */
type Change = { renamed: Pick<Passkey, 'id' | 'name'> } | { deleted: Passkey['id'] }

/** The list with a change the server has not confirmed yet applied to it. */
const withChange = (passkeys: Passkey[], change: Change) =>
  'deleted' in change
    ? passkeys.filter(passkey => passkey.id !== change.deleted)
    : passkeys.map(passkey => (passkey.id === change.renamed.id ? { ...passkey, name: change.renamed.name } : passkey))

/** The account by name, its passkeys, and the way out. Adding passkeys and the email come with #720 and on. */
export const DashboardPage = () => {
  const { me, passkeys } = useLoaderData<DashboardData>()
  const revalidator = useRevalidator()
  // React shows the changed list while the row's action runs and goes back to the loader's once it settles.
  const [shownPasskeys, showChange] = useOptimistic(passkeys, withChange)
  // The row that could not be deleted explains why once it is back in the list; the next delete starts clean.
  const [deleteFailure, setDeleteFailure] = useState<{ id: string; reason: DeleteFailure } | null>(null)

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
    showChange({ renamed: { id, name } })
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

  const remove = async (id: string) => {
    setDeleteFailure(null)
    showChange({ deleted: id })
    try {
      await deletePasskey(id)
    } catch (error) {
      if (isApiError(error) && error.code === 'last_passkey') {
        // Lost a race with another tab: this is the only passkey now. The reload below turns its delete off with the same words.
        setDeleteFailure({ id, reason: 'lastPasskey' })
        await revalidator.revalidate()
        return
      }
      // Deleted in another tab: the list is stale, and the reload below takes the row away all the same.
      if (!(isApiError(error) && error.code === 'passkey_not_found')) {
        // The list is fine; the row comes back with the failed action and says so.
        setDeleteFailure({ id, reason: 'failed' })
        return
      }
    }
    // The action stays pending until the loader no longer has the row, so it never flickers back.
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
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              deletable={shownPasskeys.length > 1}
              deleteFailure={deleteFailure?.id === passkey.id ? deleteFailure.reason : null}
              onRename={name => rename(passkey.id, name)}
              onDelete={() => remove(passkey.id)}
            />
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
