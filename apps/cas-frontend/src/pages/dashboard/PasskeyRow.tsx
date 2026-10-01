import { useActionState, useEffect, useId, useRef, useState } from 'react'
import type { Ref } from 'react'

import type { Passkey } from '#entities/passkey'
import { isApiError } from '#shared/api/request'
import { MAX_LABEL_LENGTH, labelProblem, normalizeLabel } from '#shared/lib/label'
import { Button, Icon, Spinner, SubmitButton, TextField } from '#shared/ui'
import { DeletePasskeyDialog } from './DeletePasskeyDialog'
import { describeDate } from './describeDate'

/** What the field says about a name this row could not give the passkey; never the raw message. */
const messages = {
  empty: 'Введите название.',
  tooLong: `Слишком длинное название, максимум ${MAX_LABEL_LENGTH} символа.`,
  /** The server's `invalid_passkey_name` for anything the client did not catch: invisible or direction-changing characters. */
  disallowed: 'Название содержит недопустимые символы.',
  /** Anything else: an outage, no network. */
  failed: 'Не получилось переименовать. Попробуйте ещё раз через минуту.',
} as const

/** What the row says under its meta line about a delete it cannot offer or could not do; never the raw message. */
const deleteMessages = {
  /** The only passkey, whether the list says so or the server did (`last_passkey`, lost a race with another tab). */
  lastPasskey: 'Единственный пасскей нельзя удалить: сначала добавьте второй.',
  /** Anything else: an outage, no network. */
  failed: 'Не получилось удалить. Попробуйте ещё раз через минуту.',
} as const

/** Why the last delete of this passkey did not go through. */
export type DeleteFailure = keyof typeof deleteMessages

interface PasskeyRowProps {
  passkey: Passkey
  /** `false` for the account's only passkey: the delete control is off, with the reason under the row. */
  deletable: boolean
  /** The reason the page has for the last delete of this passkey that failed; `null` when there is none. */
  deleteFailure: DeleteFailure | null
  /** Sends the new name. The page shows it in the list at once and takes it back if this throws. */
  onRename: (name: string) => Promise<void>
  /** Sends the delete once confirmed. The page takes the row out of the list at once and brings it back with a reason if the delete fails. */
  onDelete: () => Promise<void>
}

/** One passkey in the list: the key chip, the name, when it was made and last used, and the ways to rename and delete it. */
export const PasskeyRow = ({ passkey, deletable, deleteFailure, onRename, onDelete }: PasskeyRowProps) => {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  // Focus goes back to where the editing began, after a save and a cancel alike; not on first render.
  // A save ends later than the form, so by then the user may be typing elsewhere: then it stays there.
  useEffect(() => {
    const active = document.activeElement
    const movedAway = active !== null && active !== document.body && !row.current?.contains(active)
    if (wasEditing.current && !editing && !movedAway) {
      renameButton.current?.focus()
    }
    wasEditing.current = editing
  }, [editing])

  // The list's own reason wins over the page's: it is the same sentence, and the list's stays current.
  const note = !deletable || deleteFailure === 'lastPasskey' ? 'lastPasskey' : deleteFailure

  return (
    <li ref={row} className="px-4 py-3.5">
      {editing ? (
        <Editor passkey={passkey} onRename={onRename} onDone={() => setEditing(false)} />
      ) : (
        <Row
          passkey={passkey}
          note={note}
          deletable={deletable}
          onEdit={() => setEditing(true)}
          onDelete={() => setConfirming(true)}
          ref={renameButton}
        />
      )}
      {confirming && <DeletePasskeyDialog passkey={passkey} onDelete={onDelete} onClose={() => setConfirming(false)} />}
    </li>
  )
}

interface FormState {
  /** What was submitted, so the field keeps it after a rejection; `null` before the first submit. */
  name: string | null
  error: string | null
}

const idle: FormState = { name: null, error: null }

interface EditorProps extends Pick<PasskeyRowProps, 'passkey' | 'onRename'> {
  onDone: () => void
}

/**
 * The rename form. Mounted for one editing session: it is gone after a save
 * or a cancel, so the next one starts clean. While the rename is on its way
 * it shows the row with the new name instead of the form, and brings the
 * form back only to explain a rejection.
 */
const Editor = ({ passkey, onRename, onDone }: EditorProps) => {
  const [state, save, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    // Normalised the way the server does it, so the length check and the sent value agree with it.
    const name = normalizeLabel(String(form.get('name') ?? ''))
    const problem = labelProblem(name)
    if (problem) {
      return { name, error: messages[problem] }
    }
    if (name !== passkey.name) {
      try {
        await onRename(name)
      } catch (error) {
        const disallowed = isApiError(error) && error.code === 'invalid_passkey_name'
        return { name, error: disallowed ? messages.disallowed : messages.failed }
      }
    }
    onDone()
    return idle
  }, idle)

  if (pending) {
    return <Row passkey={passkey} pending />
  }

  return (
    <form action={save} className="flex flex-col gap-3">
      <TextField
        label="Название"
        name="name"
        defaultValue={state.name ?? passkey.name}
        autoFocus
        autoComplete="off"
        // Twice the cap in UTF-16 units: the check counts code points, and a hard limit here would cut emoji names short.
        maxLength={MAX_LABEL_LENGTH * 2}
        error={state.error}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            onDone()
          }
        }}
      />
      <div className="flex gap-2.5">
        <SubmitButton variant="secondary">Сохранить</SubmitButton>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

interface RowProps {
  passkey: Passkey
  /** The line under the meta about deleting; `null` when there is nothing to say. */
  note?: DeleteFailure | null
  deletable?: boolean
  onEdit?: () => void
  onDelete?: () => void
  /** While a rename is on its way: the row shows the new name and the button shows the spinner in place of the pencil. */
  pending?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** "Создан 12 сентября · Использован сегодня"; a passkey that never signed in says so. */
const describe = ({ createdAt, lastUsedAt }: Passkey) =>
  `Создан ${describeDate(createdAt)} · ${lastUsedAt ? `Использован ${describeDate(lastUsedAt)}` : 'Не использовался'}`

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-chip text-ink-muted transition outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink enabled:hover:bg-line-soft'

const Row = ({ passkey, note = null, deletable = true, onEdit, onDelete, pending = false, ref }: RowProps) => {
  const noteId = useId()
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-accent-tint text-ink">
        <Icon name="key" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base leading-tight font-extrabold">{passkey.name}</span>
        <span className="text-[13px] leading-snug font-medium text-ink-muted">{describe(passkey)}</span>
        {note && (
          <span id={noteId} className={`text-xs leading-snug font-medium ${note === 'failed' ? 'text-danger' : 'text-ink-muted'}`}>
            {deleteMessages[note]}
          </span>
        )}
      </div>
      <div className="-mr-2 flex shrink-0 gap-1">
        <button
          ref={ref}
          type="button"
          onClick={onEdit}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={`Переименовать «${passkey.name}»`}
          className={iconButton}
        >
          {pending ? <Spinner /> : <Icon name="pencil" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || !deletable}
          aria-label={`Удалить «${passkey.name}»`}
          aria-describedby={note ? noteId : undefined}
          className={`${iconButton} disabled:text-ink-hint`}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  )
}
