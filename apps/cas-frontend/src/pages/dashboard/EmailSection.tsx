import { useActionState, useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'

import { isApiError } from '#shared/api/request'
import { Button, Icon, Section, Spinner, SubmitButton, TextField } from '#shared/ui'

/** What the field says about an address this section could not save; never the raw message. */
export const messages = {
  empty: 'Введите адрес.',
  /** No `@`: the one shape the client tells before asking. */
  notAnAddress: 'Похоже, это не адрес почты.',
  /** The server's `invalid_email` for anything the client did not catch: spaces or invisible characters, a second `@`, a broken domain, over the cap. */
  invalid: 'Проверьте адрес: в нём ошибка или недопустимые символы.',
  /** Anything else: an outage, no network. */
  failed: 'Не получилось сохранить почту. Попробуйте ещё раз через минуту.',
} as const

/** The row without an address: what recovery will need, and that nothing is verified yet. */
const empty = {
  title: 'Не указана',
  text: 'Понадобится для восстановления, когда оно появится. Пока без подтверждения.',
}

/** The line under a set address: v1 stores it as typed, the verification flow comes with recovery. */
const unverified = 'Не подтверждена. Подтверждение появится позже.'

type EmailProblem = 'empty' | 'notAnAddress'

/**
 * What the client can tell before asking the server, on an address already
 * trimmed: emptiness and a missing `@`. Everything else (the characters, the
 * domain, the length) is the server's call, answered as `invalid_email`.
 */
const emailProblem = (email: string): EmailProblem | null => {
  if (email.length === 0) {
    return 'empty'
  }
  if (!email.includes('@')) {
    return 'notAnAddress'
  }
  return null
}

interface EmailSectionProps {
  /** The address as the page shows it: the loader's, or the one on its way to the server. */
  email: string | null
  /** Sends the address, `null` to clear it. The page shows it at once and takes it back if this throws. */
  onSave: (email: string | null) => Promise<void>
}

/**
 * The "Почта" section: the mail chip, the address or the empty state in its
 * place, and the way to add, change and clear it. Editing turns the row
 * into a form. The address is stored unverified in v1, and the row says so.
 */
export const EmailSection = ({ email, onSave }: EmailSectionProps) => {
  const [editing, setEditing] = useState(false)
  // "Добавить" in the title row or the pencil in the row: whichever opened the form.
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  // Focus goes back to where the editing began, after a save and a cancel alike; not on first render.
  // A save ends later than the form, so by then the user may be typing elsewhere: then it stays there.
  // The section has nothing else to hold focus, so anything but the body counts as elsewhere.
  useEffect(() => {
    const active = document.activeElement
    const movedAway = active !== null && active !== document.body
    if (wasEditing.current && !editing && !movedAway) {
      editButton.current?.focus()
    }
    wasEditing.current = editing
  }, [editing])

  const edit = () => setEditing(true)
  const done = () => setEditing(false)

  return (
    <Section title="Почта" action={email === null && !editing ? <AddButton ref={editButton} onClick={edit} /> : undefined}>
      <div className="px-4 py-3.5">
        {editing ? <Editor email={email} onSave={onSave} onDone={done} /> : <Row email={email} onEdit={edit} ref={editButton} />}
      </div>
    </Section>
  )
}

interface FormState {
  /** What was submitted, so the field keeps it after a rejection; `null` before the first submit and after a clear. */
  email: string | null
  error: string | null
}

const idle: FormState = { email: null, error: null }

interface EditorProps extends EmailSectionProps {
  onDone: () => void
}

/**
 * The email form. Mounted for one editing session: it is gone after a save
 * or a cancel, so the next one starts clean. While the address is on its way
 * it shows the row with the new address (or the empty state after a clear)
 * instead of the form, and brings the form back only to explain a rejection.
 * "Удалить" is a second submit of the same form that sends `null`.
 */
const Editor = ({ email, onSave, onDone }: EditorProps) => {
  const [state, submit, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    // Trimmed the way the server does it first, so an address of spaces is empty here and not `invalid_email` there.
    const address = form.get('intent') === 'clear' ? null : String(form.get('email') ?? '').trim()
    if (address !== null) {
      const problem = emailProblem(address)
      if (problem) {
        return { email: address, error: messages[problem] }
      }
    }
    if (address !== email) {
      try {
        await onSave(address)
      } catch (error) {
        const invalid = isApiError(error) && error.code === 'invalid_email'
        return { email: address, error: invalid ? messages.invalid : messages.failed }
      }
    }
    onDone()
    return idle
  }, idle)

  if (pending) {
    return <Row email={email} pending />
  }

  return (
    // `noValidate`: the browser's own check on `type="email"` would stop the submit with its own words.
    <form action={submit} noValidate className="flex flex-col gap-3">
      <TextField
        label="Почта"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.email ?? email ?? ''}
        autoFocus
        error={state.error}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            onDone()
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <SubmitButton variant="secondary">Сохранить</SubmitButton>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>
        {email !== null && (
          <button type="submit" name="intent" value="clear" className={`${inlineButton} ml-auto text-danger`}>
            <Icon name="trash" size={18} />
            Удалить
          </button>
        )}
      </div>
    </form>
  )
}

const inlineButton =
  'flex h-11 shrink-0 items-center gap-1.5 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:text-ink-hint'

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-chip text-ink-muted transition outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink enabled:hover:bg-line-soft'

interface AddButtonProps {
  onClick: () => void
  ref: Ref<HTMLButtonElement>
}

/** "Добавить" in the title row while there is no address; named in full for a screen reader, next to the passkeys' "Добавить". */
const AddButton = ({ onClick, ref }: AddButtonProps) => (
  <button ref={ref} type="button" onClick={onClick} aria-label="Добавить почту" className={`${inlineButton} text-ink-muted`}>
    <Icon name="plus" size={18} />
    Добавить
  </button>
)

interface RowProps {
  email: string | null
  onEdit?: () => void
  /** While the address is on its way: the row shows it (or the empty state) and the spinner takes the pencil's place. */
  pending?: boolean
  ref?: Ref<HTMLButtonElement>
}

const Row = ({ email, onEdit, pending = false, ref }: RowProps) => (
  <div className="flex items-center gap-3">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-accent-tint text-ink">
      <Icon name="mail" />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-base leading-tight font-extrabold">{email ?? empty.title}</span>
      <span className="text-[13px] leading-snug font-medium text-ink-muted">{email === null ? empty.text : unverified}</span>
    </div>
    {email !== null ? (
      <button
        ref={ref}
        type="button"
        onClick={onEdit}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label="Изменить почту"
        className={`${iconButton} -mr-2`}
      >
        {pending ? <Spinner /> : <Icon name="pencil" />}
      </button>
    ) : (
      // A clear on its way: nothing to press yet, only the wait where the pencil was.
      pending && (
        <span className="-mr-2 flex size-11 shrink-0 items-center justify-center" aria-busy="true">
          <Spinner />
        </span>
      )
    )}
  </div>
)
