import { useEffect, useId, useRef } from 'react'
import type { MouseEvent } from 'react'

import type { Passkey } from '#entities/passkey'
import { Button, Icon, SubmitButton } from '#shared/ui'

interface DeletePasskeyDialogProps {
  passkey: Passkey
  /** Runs when the user confirms; the dialog is already gone by then. */
  onDelete: () => Promise<void>
  /** Runs when the dialog closes for any reason: confirm, "Отмена", Escape, a tap on the backdrop. */
  onClose: () => void
}

/**
 * The sheet that asks before a passkey goes: a modal `<dialog>` over the
 * dimmed page, opened as soon as it mounts and gone as soon as it closes,
 * so every confirmation starts fresh. Confirming is a form action: the
 * dialog closes at once and the caller takes it from there.
 */
export const DeletePasskeyDialog = ({ passkey, onDelete, onClose }: DeletePasskeyDialogProps) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()

  // Modal from the start; focus lands on "Отмена" so a stray Enter deletes nothing.
  useEffect(() => {
    dialog.current?.showModal()
    cancelButton.current?.focus()
  }, [])

  const confirm = async () => {
    onClose()
    await onDelete()
  }

  // The dialog's own box is the sheet; a click that lands on it and not on the content came from the backdrop.
  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) {
      dialog.current?.close()
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={closeFromBackdrop}
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="fixed inset-x-4 top-auto bottom-4 m-0 mx-auto w-auto max-w-[388px] rounded-card bg-surface p-0 text-ink shadow-[0_24px_48px_rgba(13,47,57,0.25)] backdrop:bg-ink/45"
    >
      <form action={confirm} className="flex flex-col gap-[18px] px-5 pt-6 pb-5">
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="text-[22px] leading-[1.2] font-extrabold">
            Удалить пасскей «{passkey.name}»?
          </h2>
          <p id={textId} className="text-[15px] leading-[1.45] font-medium text-ink-muted">
            Вход с этого устройства перестанет работать. Открытые сессии останутся, из них можно выйти отдельно.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <SubmitButton variant="danger" icon={<Icon name="trash" />}>
            Удалить
          </SubmitButton>
          <Button ref={cancelButton} variant="secondary" className="min-h-14" onClick={() => dialog.current?.close()}>
            Отмена
          </Button>
        </div>
      </form>
    </dialog>
  )
}
