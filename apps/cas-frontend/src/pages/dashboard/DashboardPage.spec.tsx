import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { DashboardPage } from './DashboardPage'
import { loadDashboard } from './loadDashboard'

const { getMe, logout, updateEmail, listPasskeys, renamePasskey, deletePasskey, addPasskey } = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  updateEmail: vi.fn(),
  listPasskeys: vi.fn(),
  renamePasskey: vi.fn(),
  deletePasskey: vi.fn(),
  addPasskey: vi.fn(),
}))
// Only the calls are faked; the ceremony predicates (`isCeremonyCancelled`, ...) stay real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({
  ...(await importOriginal<typeof import('#entities/session')>()),
  getMe,
  logout,
  updateEmail,
}))
vi.mock('#entities/passkey', () => ({ listPasskeys, renamePasskey, deletePasskey, addPasskey }))

/** jsdom has no modal dialogs; this is as much of one as the sheet needs: open, close with the event, and focus back where it was. */
const polyfillDialog = () => {
  const openers = new WeakMap<HTMLDialogElement, Element | null>()
  HTMLDialogElement.prototype.showModal = function () {
    openers.set(this, document.activeElement)
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) {
      return
    }
    this.open = false
    this.dispatchEvent(new Event('close'))
    const opener = openers.get(this)
    if (opener instanceof HTMLElement) {
      opener.focus()
    }
  }
}

const me = { accountId: 'acc', displayName: 'Ада', accountType: 'full', email: null, sessionExpiresAt: '2026-09-17T00:00:00Z' }
const today = new Date().toISOString()
const passkeys = [
  { id: 'p1', name: 'Пасскей', createdAt: today, lastUsedAt: null },
  { id: 'p2', name: 'iPhone Ады', createdAt: '2025-12-31T12:00:00Z', lastUsedAt: today },
]

/** The real loader in front of the page, so the spec covers what the revalidation after an action does. */
const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: routes.DASHBOARD, loader: loadDashboard, element: <DashboardPage />, HydrateFallback: () => null },
      { path: routes.SIGN_IN, element: <h1>Вход</h1> },
    ],
    { initialEntries: [routes.DASHBOARD] },
  )
  render(<RouterProvider router={router} />)
}

const signOut = async () => {
  renderPage()
  await screen.findByRole('heading', { name: 'Ада' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Выйти' }))
}

/** Opens the rename form on the second row and submits `name` in place of "iPhone Ады". */
const rename = async (name: string) => {
  renderPage()
  await screen.findByRole('heading', { name: 'Ада' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Переименовать «iPhone Ады»' }))
  const field = screen.getByLabelText('Название')
  await user.clear(field)
  if (name) {
    await user.type(field, name)
  }
  await user.click(screen.getByRole('button', { name: 'Сохранить' }))
}

/** Opens the delete sheet for the second row, "iPhone Ады". */
const openDelete = async () => {
  renderPage()
  await screen.findByRole('heading', { name: 'Ада' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' }))
  return user
}

/** Opens the delete sheet for "iPhone Ады" and confirms. */
const confirmDelete = async () => {
  const user = await openDelete()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
}

const rowNames = () => screen.getAllByRole('listitem').map(item => item.textContent)

const lastPasskeyNote = 'Единственный пасскей нельзя удалить: сначала добавьте второй.'

describe('DashboardPage', () => {
  beforeAll(polyfillDialog)

  beforeEach(() => {
    listPasskeys.mockResolvedValue(passkeys)
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    getMe.mockReset()
    logout.mockReset()
    updateEmail.mockReset()
    listPasskeys.mockReset()
    renamePasskey.mockReset()
    deletePasskey.mockReset()
    addPasskey.mockReset()
  })

  it('lists the passkeys with when they were made and last used', async () => {
    getMe.mockResolvedValue(me)

    renderPage()

    const items = await screen.findAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual([
      'ПасскейСоздан сегодня · Не использовался',
      'iPhone АдыСоздан 31 декабря 2025 г. · Использован сегодня',
    ])
  })

  it('ends the session and lands on sign-in', async () => {
    getMe.mockResolvedValue(me)
    // Once the cookie is gone `/api/me` answers 401, which is what the revalidation sees.
    logout.mockImplementation(async () => {
      getMe.mockRejectedValue(new ApiError(401, 'unauthenticated', 'No live session'))
    })

    await signOut()

    expect(logout).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Вход' })).toBeDefined())
  })

  it('stays on the dashboard with an alert when sign-out fails, never the raw message', async () => {
    getMe.mockResolvedValue(me)
    logout.mockRejectedValue(new TypeError('Failed to fetch'))

    await signOut()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не получилось выйти')
    expect(alert.textContent).not.toContain('Failed to fetch')
    expect(screen.getByRole('heading', { name: 'Ада' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeDefined()
  })

  describe('rename', () => {
    beforeEach(() => {
      getMe.mockResolvedValue(me)
    })

    it('shows the new name at once, sends it normalised and keeps it after the reload', async () => {
      const renamed = { ...passkeys[1], name: 'Мой iPhone' }
      let confirm = () => {}
      renamePasskey.mockImplementation(
        () =>
          new Promise<typeof renamed>(resolve => {
            confirm = () => resolve(renamed)
          }),
      )

      await rename('  Мой  iPhone ')

      // Before the server answers: the row already reads the new name, the form is gone, the button waits.
      await waitFor(() => expect(rowNames()[1]).toContain('Мой iPhone'))
      expect(screen.queryByLabelText('Название')).toBeNull()
      const waiting = screen.getByRole('button', { name: 'Переименовать «Мой iPhone»' })
      expect(waiting).toHaveProperty('disabled', true)
      expect(waiting.getAttribute('aria-busy')).toBe('true')
      expect(renamePasskey).toHaveBeenCalledWith('p2', 'Мой iPhone')
      expect(listPasskeys).toHaveBeenCalledOnce()

      listPasskeys.mockResolvedValue([passkeys[0], renamed])
      confirm()

      await waitFor(() => expect(listPasskeys).toHaveBeenCalledTimes(2))
      expect(rowNames()[1]).toContain('Мой iPhone')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Переименовать «Мой iPhone»' })).toHaveProperty('disabled', false))
    })

    it('puts focus back on the button after a save unless the user has moved on', async () => {
      let confirm = () => {}
      renamePasskey.mockImplementation(
        () =>
          new Promise<(typeof passkeys)[1]>(resolve => {
            confirm = () => resolve({ ...passkeys[1], name: 'Мой iPhone' })
          }),
      )

      await rename('Мой iPhone')

      // Meanwhile the user starts on the other row.
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Переименовать «Пасскей»' }))
      const other = screen.getByLabelText<HTMLInputElement>('Название')
      await user.type(other, ' Ады')

      listPasskeys.mockResolvedValue([passkeys[0], { ...passkeys[1], name: 'Мой iPhone' }])
      confirm()

      await waitFor(() => expect(screen.getByRole('button', { name: 'Переименовать «Мой iPhone»' })).toHaveProperty('disabled', false))
      expect(document.activeElement).toBe(other)
      expect(other.value).toBe('Пасскей Ады')
    })

    it('takes back a name the server rejects and says why under the field', async () => {
      renamePasskey.mockRejectedValue(
        new ApiError(400, 'invalid_passkey_name', 'Invalid passkey name: must not contain control or invisible characters'),
      )

      await rename('Ада​')

      const field = await screen.findByLabelText<HTMLInputElement>('Название')
      expect(field.value).toBe('Ада​')
      expect(field).toHaveProperty('ariaInvalid', 'true')
      expect(screen.getByText('Название содержит недопустимые символы.')).toBeDefined()
      // The optimistic name is gone with the failed action; the loader was not asked again.
      expect(screen.queryByText('Ада​')).toBeNull()
      expect(listPasskeys).toHaveBeenCalledOnce()
    })

    it('does not send an empty name', async () => {
      await rename('   ')

      expect(screen.getByText('Введите название.')).toBeDefined()
      expect(renamePasskey).not.toHaveBeenCalled()
    })

    it('does not send a name over the cap', async () => {
      await rename('a'.repeat(65))

      expect(screen.getByText('Слишком длинное название, максимум 64 символа.')).toBeDefined()
      expect(renamePasskey).not.toHaveBeenCalled()
    })

    it('closes the form without a request when the name did not change', async () => {
      await rename('iPhone Ады')

      await waitFor(() => expect(screen.queryByLabelText('Название')).toBeNull())
      expect(renamePasskey).not.toHaveBeenCalled()
      expect(listPasskeys).toHaveBeenCalledOnce()
    })

    it('keeps the form with its own words when the request fails for another reason', async () => {
      renamePasskey.mockRejectedValue(new TypeError('Failed to fetch'))

      await rename('Мой iPhone')

      const message = await screen.findByText('Не получилось переименовать. Попробуйте ещё раз через минуту.')
      expect(message).toBeDefined()
      expect(screen.queryByText('Failed to fetch')).toBeNull()
      // The form is back with what was typed; the optimistic name left the list with the failed action.
      expect(screen.getByLabelText<HTMLInputElement>('Название').value).toBe('Мой iPhone')
      expect(screen.queryByText('Мой iPhone')).toBeNull()
    })

    it('lets the row go when the passkey was deleted in another tab', async () => {
      // Gone by the time the rename arrives, so the reload after it no longer lists it.
      renamePasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([passkeys[0]])
        throw new ApiError(404, 'passkey_not_found', 'No such passkey')
      })

      await rename('Мой iPhone')

      await waitFor(() => expect(rowNames()).toHaveLength(1))
      expect(screen.queryByLabelText('Название')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('leaves the name alone on cancel', async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Ада' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Переименовать «iPhone Ады»' }))
      await user.type(screen.getByLabelText('Название'), ' Плюс')

      await user.click(screen.getByRole('button', { name: 'Отмена' }))

      expect(screen.queryByLabelText('Название')).toBeNull()
      expect(rowNames()[1]).toContain('iPhone Ады')
      expect(renamePasskey).not.toHaveBeenCalled()
      // Focus is back where the editing began.
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Переименовать «iPhone Ады»' }))
      expect(within(screen.getAllByRole('listitem')[1]).queryByText('iPhone Ады Плюс')).toBeNull()
    })
  })
  describe('delete', () => {
    beforeEach(() => {
      getMe.mockResolvedValue(me)
    })

    it('asks in a sheet, takes the row out at once and keeps it out after the reload', async () => {
      let confirm = () => {}
      deletePasskey.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            confirm = resolve
          }),
      )

      const user = await openDelete()

      const dialog = screen.getByRole('dialog', { name: 'Удалить пасскей «iPhone Ады»?' })
      expect(dialog.textContent).toContain('Вход с этого устройства перестанет работать.')
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Отмена' }))
      expect(deletePasskey).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

      // Before the server answers: the sheet is gone and so is the row; the other one is now the only one.
      await waitFor(() => expect(rowNames()).toEqual(['ПасскейСоздан сегодня · Не использовался' + lastPasskeyNote]))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('button', { name: 'Удалить «Пасскей»' })).toHaveProperty('disabled', true)
      expect(deletePasskey).toHaveBeenCalledWith('p2')
      expect(listPasskeys).toHaveBeenCalledOnce()

      listPasskeys.mockResolvedValue([passkeys[0]])
      confirm()

      await waitFor(() => expect(listPasskeys).toHaveBeenCalledTimes(2))
      expect(rowNames()).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Удалить «Пасскей»' })).toHaveProperty('disabled', true)
    })

    it('leaves the list alone on cancel and puts focus back on the button', async () => {
      const user = await openDelete()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(rowNames()).toHaveLength(2)
      expect(deletePasskey).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' }))
    })

    it('keeps the only passkey with its delete off and the reason under it', async () => {
      listPasskeys.mockResolvedValue([passkeys[0]])

      renderPage()

      const button = await screen.findByRole('button', { name: 'Удалить «Пасскей»' })
      expect(button).toHaveProperty('disabled', true)
      const note = screen.getByText(lastPasskeyNote)
      expect(button.getAttribute('aria-describedby')).toBe(note.id)
      expect(screen.getByRole('button', { name: 'Переименовать «Пасскей»' })).toHaveProperty('disabled', false)
    })

    it('brings the row back with the same reason when the server says it is the last one', async () => {
      // The other passkey went in another tab between the list and the delete, so the server refuses.
      deletePasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([passkeys[1]])
        throw new ApiError(409, 'last_passkey', 'Cannot delete the last passkey; add another one first')
      })

      await confirmDelete()

      await waitFor(() => expect(rowNames()).toEqual(['iPhone АдыСоздан 31 декабря 2025 г. · Использован сегодня' + lastPasskeyNote]))
      expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', true)
      expect(screen.getAllByText(lastPasskeyNote)).toHaveLength(1)
      expect(listPasskeys).toHaveBeenCalledTimes(2)
    })

    it('says so in the row when the server refuses and the list has not caught up', async () => {
      deletePasskey.mockRejectedValue(new ApiError(409, 'last_passkey', 'Cannot delete the last passkey; add another one first'))

      await confirmDelete()

      await waitFor(() => expect(rowNames()).toHaveLength(2))
      expect(within(screen.getAllByRole('listitem')[1]).getByText(lastPasskeyNote)).toBeDefined()
      expect(screen.getAllByText(lastPasskeyNote)).toHaveLength(1)
    })

    it('brings the row back with its own words when the request fails for another reason', async () => {
      deletePasskey.mockRejectedValue(new TypeError('Failed to fetch'))

      await confirmDelete()

      await waitFor(() => expect(rowNames()).toHaveLength(2))
      const row = screen.getAllByRole('listitem')[1]
      expect(within(row).getByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toBeDefined()
      expect(screen.queryByText('Failed to fetch')).toBeNull()
      // The list is fine as it is: the loader was not asked again, and the delete stays on offer.
      expect(listPasskeys).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', false)
    })

    it('keeps a reason on every row when two deletes in flight both fail', async () => {
      const third = { id: 'p3', name: 'Ключ на работе', createdAt: today, lastUsedAt: null }
      listPasskeys.mockResolvedValue([...passkeys, third])
      const rejections: Array<() => void> = []
      deletePasskey.mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejections.push(() => reject(new TypeError('Failed to fetch')))
          }),
      )

      const user = await openDelete()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(rowNames()).toHaveLength(2))
      await user.click(screen.getByRole('button', { name: 'Удалить «Ключ на работе»' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(rowNames()).toHaveLength(1))
      expect(rejections).toHaveLength(2)

      rejections.forEach(reject => reject())

      await waitFor(() => expect(rowNames()).toHaveLength(3))
      expect(screen.getAllByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toHaveLength(2)
      const [, second, last] = screen.getAllByRole('listitem')
      expect(within(second).getByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toBeDefined()
      expect(within(last).getByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toBeDefined()
    })

    it('takes away only the retried row reason', async () => {
      const third = { id: 'p3', name: 'Ключ на работе', createdAt: today, lastUsedAt: null }
      listPasskeys.mockResolvedValue([...passkeys, third])
      deletePasskey.mockRejectedValue(new TypeError('Failed to fetch'))

      const user = await openDelete()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(screen.getAllByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toHaveLength(1))
      await user.click(screen.getByRole('button', { name: 'Удалить «Ключ на работе»' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(screen.getAllByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toHaveLength(2))

      // Retrying the second row takes only its own words away while the request is out.
      let settle = () => {}
      deletePasskey.mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) => {
            settle = () => reject(new TypeError('Failed to fetch'))
          }),
      )
      await user.click(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(rowNames()).toHaveLength(2))
      expect(screen.getAllByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toHaveLength(1)
      expect(within(screen.getAllByRole('listitem')[1]).getByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toBeDefined()
      settle()
      await waitFor(() => expect(rowNames()).toHaveLength(3))
    })

    it('lets the row go when the passkey was deleted in another tab', async () => {
      deletePasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([passkeys[0]])
        throw new ApiError(404, 'passkey_not_found', 'No such passkey')
      })

      await confirmDelete()

      await waitFor(() => expect(listPasskeys).toHaveBeenCalledTimes(2))
      expect(rowNames()).toHaveLength(1)
      expect(screen.queryByText('Не получилось удалить. Попробуйте ещё раз через минуту.')).toBeNull()
    })
  })

  describe('add', () => {
    const added = { id: 'p3', name: 'Пасскей', createdAt: today, lastUsedAt: null }
    const nudgeTitle = 'Добавьте второй пасскей'

    /** Renders the one-passkey dashboard and clicks the nudge's button. */
    const addFromNudge = async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Ада' })
      await userEvent.setup().click(screen.getByRole('button', { name: 'Добавить пасскей' }))
    }

    beforeEach(() => {
      getMe.mockResolvedValue(me)
      listPasskeys.mockResolvedValue([passkeys[1]])
    })

    it('runs the ceremony from the nudge, then lists both passkeys, drops the nudge and turns delete on', async () => {
      let confirm = () => {}
      addPasskey.mockImplementation(
        () =>
          new Promise<typeof added>(resolve => {
            confirm = () => resolve(added)
          }),
      )

      await addFromNudge()

      // While the browser's prompt is up: both controls wait, the hint says what to do, nothing has been reloaded.
      const waiting = await screen.findByRole('button', { name: 'Подтвердите пасскей…' })
      expect(waiting).toHaveProperty('disabled', true)
      expect(screen.getByText('Следуйте подсказке браузера или телефона.')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Добавить' })).toHaveProperty('disabled', true)
      expect(addPasskey).toHaveBeenCalledOnce()
      expect(listPasskeys).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', true)

      listPasskeys.mockResolvedValue([passkeys[1], added])
      confirm()

      await waitFor(() => expect(rowNames()).toHaveLength(2))
      expect(rowNames()[1]).toBe('ПасскейСоздан сегодня · Не использовался')
      expect(screen.queryByText(nudgeTitle)).toBeNull()
      expect(screen.queryByText(lastPasskeyNote)).toBeNull()
      expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', false)
      expect(screen.getByRole('button', { name: 'Добавить' })).toHaveProperty('disabled', false)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('takes away the last-passkey words a refused delete left once a second passkey is added', async () => {
      // Two passkeys listed; the other one goes in another tab, so the delete is refused and the list catches up.
      listPasskeys.mockResolvedValue(passkeys)
      deletePasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([passkeys[1]])
        throw new ApiError(409, 'last_passkey', 'Cannot delete the last passkey; add another one first')
      })
      addPasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([passkeys[1], added])
        return added
      })
      const user = await openDelete()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', true))
      expect(screen.getByText(lastPasskeyNote)).toBeDefined()

      await user.click(screen.getByRole('button', { name: 'Добавить пасскей' }))

      await waitFor(() => expect(rowNames()).toHaveLength(2))
      expect(screen.queryByText(lastPasskeyNote)).toBeNull()
      expect(screen.getByRole('button', { name: 'Удалить «iPhone Ады»' })).toHaveProperty('disabled', false)
    })

    it('runs the same ceremony from the title row', async () => {
      listPasskeys.mockResolvedValue(passkeys)
      addPasskey.mockImplementation(async () => {
        listPasskeys.mockResolvedValue([...passkeys, added])
        return added
      })
      renderPage()
      await screen.findByRole('heading', { name: 'Ада' })
      expect(screen.queryByText(nudgeTitle)).toBeNull()

      await userEvent.setup().click(screen.getByRole('button', { name: 'Добавить' }))

      await waitFor(() => expect(rowNames()).toHaveLength(3))
      expect(addPasskey).toHaveBeenCalledOnce()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it.each([
      ['the browser’s NotAllowedError', new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')],
      ['a challenge the server no longer has', new ApiError(404, 'registration_not_found', 'No such registration')],
    ])('says the addition was cancelled after %s and keeps the nudge', async (_case, error) => {
      addPasskey.mockRejectedValue(error)

      await addFromNudge()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Добавление отменено')
      expect(alert.textContent).toContain('Окно подтверждения закрылось или вышло время.')
      expect(screen.getByText(nudgeTitle)).toBeDefined()
      expect(screen.getByRole('button', { name: 'Добавить пасскей' })).toHaveProperty('disabled', false)
      expect(rowNames()).toHaveLength(1)
      expect(listPasskeys).toHaveBeenCalledOnce()
    })

    it.each([
      [
        'the authenticator refuses the exclude list',
        new DOMException('The user attempted to register an authenticator that is already registered.', 'InvalidStateError'),
      ],
      ['the server already holds the credential', new ApiError(409, 'credential_already_registered', 'Credential already registered')],
    ])('says this device already has a passkey when %s', async (_case, error) => {
      addPasskey.mockRejectedValue(error)

      await addFromNudge()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('На этом устройстве уже есть пасскей')
      expect(alert.textContent).toContain('Второй пасскей нужен на другом устройстве')
      expect(alert.textContent).not.toContain('already registered')
      expect(screen.getByText(nudgeTitle)).toBeDefined()
      expect(rowNames()).toHaveLength(1)
    })

    it('says so in its own words when the ceremony fails for another reason, never the raw message', async () => {
      addPasskey.mockRejectedValue(new TypeError('Failed to fetch'))

      await addFromNudge()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Что-то пошло не так')
      expect(alert.textContent).toContain('Попробуйте ещё раз через минуту.')
      expect(screen.queryByText('Failed to fetch')).toBeNull()
      expect(screen.getByRole('button', { name: 'Добавить пасскей' })).toHaveProperty('disabled', false)
      expect(listPasskeys).toHaveBeenCalledOnce()
    })

    it('lands on sign-in when the session ended under the page', async () => {
      // The session is gone by the time the ceremony asks for its challenge; `/api/me` says the same on the reload.
      addPasskey.mockImplementation(async () => {
        getMe.mockRejectedValue(new ApiError(401, 'unauthenticated', 'No live session'))
        throw new ApiError(401, 'unauthenticated', 'No live session')
      })

      await addFromNudge()

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Вход' })).toBeDefined())
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('email', () => {
    const address = 'ada@mems.fun'
    const emptyTitle = 'Не указана'
    const unverified = 'Не подтверждена. Подтверждение появится позже.'
    const failed = 'Не получилось сохранить почту. Попробуйте ещё раз через минуту.'

    /** Renders the dashboard and opens the email form: from "Добавить" when there is no address, from the pencil when there is. */
    const openEditor = async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Ада' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /Добавить почту|Изменить почту/ }))
      return user
    }

    /** Opens the form, replaces what is in the field with `email` and saves. */
    const save = async (email: string) => {
      const user = await openEditor()
      const field = screen.getByLabelText('Почта')
      await user.clear(field)
      if (email) {
        await user.type(field, email)
      }
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      return user
    }

    it('shows the empty state with the way to add an address', async () => {
      getMe.mockResolvedValue(me)

      renderPage()

      expect(await screen.findByText(emptyTitle)).toBeDefined()
      expect(screen.getByText('Понадобится для восстановления, когда оно появится. Пока без подтверждения.')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Добавить почту' })).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Изменить почту' })).toBeNull()
    })

    it('shows the address as unverified with the way to change it', async () => {
      getMe.mockResolvedValue({ ...me, email: address })

      renderPage()

      expect(await screen.findByText(address)).toBeDefined()
      expect(screen.getByText(unverified)).toBeDefined()
      expect(screen.getByRole('button', { name: 'Изменить почту' })).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Добавить почту' })).toBeNull()
    })

    it('shows the new address at once, sends it trimmed and keeps what the server stored after the reload', async () => {
      getMe.mockResolvedValue(me)
      let confirm = () => {}
      updateEmail.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            confirm = resolve
          }),
      )

      await save('  Ada@Mems.fun ')

      // Before the server answers: the row already reads the address, the form is gone, the pencil waits.
      expect(await screen.findByText('Ada@Mems.fun')).toBeDefined()
      expect(screen.getByText(unverified)).toBeDefined()
      expect(screen.queryByLabelText('Почта')).toBeNull()
      const waiting = screen.getByRole('button', { name: 'Изменить почту' })
      expect(waiting).toHaveProperty('disabled', true)
      expect(waiting.getAttribute('aria-busy')).toBe('true')
      expect(updateEmail).toHaveBeenCalledWith('Ada@Mems.fun')
      expect(getMe).toHaveBeenCalledOnce()

      // The server keeps the local part and lower-cases the domain; that is what the loader reads back.
      getMe.mockResolvedValue({ ...me, email: 'Ada@mems.fun' })
      confirm()

      await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
      expect(await screen.findByText('Ada@mems.fun')).toBeDefined()
      expect(screen.queryByText('Ada@Mems.fun')).toBeNull()
      const pencil = screen.getByRole('button', { name: 'Изменить почту' })
      await waitFor(() => expect(pencil).toHaveProperty('disabled', false))
      expect(document.activeElement).toBe(pencil)
      expect(screen.queryByRole('button', { name: 'Добавить почту' })).toBeNull()
    })

    it('changes the address', async () => {
      getMe.mockResolvedValue({ ...me, email: address })
      updateEmail.mockImplementation(async () => {
        getMe.mockResolvedValue({ ...me, email: 'lovelace@mems.fun' })
      })

      await save('lovelace@mems.fun')

      expect(await screen.findByText('lovelace@mems.fun')).toBeDefined()
      expect(updateEmail).toHaveBeenCalledWith('lovelace@mems.fun')
      await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
      expect(screen.queryByText(address)).toBeNull()
      expect(screen.queryByLabelText('Почта')).toBeNull()
    })

    it('clears the address from its own control and sends null', async () => {
      getMe.mockResolvedValue({ ...me, email: address })
      let confirm = () => {}
      updateEmail.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            confirm = resolve
          }),
      )
      const user = await openEditor()

      await user.click(screen.getByRole('button', { name: 'Удалить' }))

      // Before the server answers: the empty state is already there, with the wait where the pencil was.
      expect(await screen.findByText(emptyTitle)).toBeDefined()
      expect(screen.queryByText(address)).toBeNull()
      expect(screen.queryByLabelText('Почта')).toBeNull()
      expect(updateEmail).toHaveBeenCalledWith(null)
      expect(getMe).toHaveBeenCalledOnce()

      getMe.mockResolvedValue(me)
      confirm()

      await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
      const add = await screen.findByRole('button', { name: 'Добавить почту' })
      expect(screen.getByText(emptyTitle)).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Изменить почту' })).toBeNull()
      expect(document.activeElement).toBe(add)
    })

    it('offers no clear control while there is no address', async () => {
      getMe.mockResolvedValue(me)

      await openEditor()

      expect(screen.getByLabelText('Почта')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull()
    })

    it('leaves the address alone on cancel and puts focus back where the editing began', async () => {
      getMe.mockResolvedValue(me)
      const user = await openEditor()
      await user.type(screen.getByLabelText('Почта'), 'ada@mems')

      await user.click(screen.getByRole('button', { name: 'Отмена' }))

      expect(screen.queryByLabelText('Почта')).toBeNull()
      expect(screen.getByText(emptyTitle)).toBeDefined()
      expect(updateEmail).not.toHaveBeenCalled()
      expect(getMe).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Добавить почту' }))
    })

    it('cancels on Escape', async () => {
      getMe.mockResolvedValue({ ...me, email: address })
      const user = await openEditor()

      await user.keyboard('{Escape}')

      expect(screen.queryByLabelText('Почта')).toBeNull()
      expect(screen.getByText(address)).toBeDefined()
      expect(updateEmail).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Изменить почту' }))
    })

    it('closes the form without a request when the address did not change', async () => {
      getMe.mockResolvedValue({ ...me, email: address })

      await save(` ${address} `)

      await waitFor(() => expect(screen.queryByLabelText('Почта')).toBeNull())
      expect(updateEmail).not.toHaveBeenCalled()
      expect(getMe).toHaveBeenCalledOnce()
    })

    it('does not send an empty address', async () => {
      getMe.mockResolvedValue(me)

      await save('   ')

      expect(screen.getByText('Введите адрес.')).toBeDefined()
      expect(screen.getByLabelText('Почта')).toHaveProperty('ariaInvalid', 'true')
      expect(updateEmail).not.toHaveBeenCalled()
    })

    it.each([
      ['no @', 'ada.mems.fun'],
      ['a comma in the name', 'ada,lovelace@mems.fun'],
      ['an underscore in the domain', 'ada@mems_fun.example'],
      ['a hyphen at the start of a label', 'ada@-mems.fun'],
    ])('does not send what the browser’s own check rejects: %s', async (_shape, value) => {
      getMe.mockResolvedValue(me)

      await save(value)

      expect(screen.getByText('Похоже, это не адрес почты.')).toBeDefined()
      expect(screen.getByLabelText<HTMLInputElement>('Почта').value).toBe(value)
      expect(updateEmail).not.toHaveBeenCalled()
    })

    it('sends an address with a plus in the name and a dotless domain: the shape is fine, the rest is the server’s call', async () => {
      getMe.mockResolvedValue(me)
      updateEmail.mockResolvedValue(undefined)

      await save('ada+cas@localhost')

      await waitFor(() => expect(updateEmail).toHaveBeenCalledWith('ada+cas@localhost'))
    })

    it('clears the address whatever the field holds', async () => {
      getMe.mockResolvedValue({ ...me, email: address })
      updateEmail.mockImplementation(async () => {
        getMe.mockResolvedValue(me)
      })
      const user = await openEditor()
      const field = screen.getByLabelText('Почта')
      await user.clear(field)
      await user.type(field, 'not an address')

      await user.click(screen.getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(updateEmail).toHaveBeenCalledWith(null))
      expect(await screen.findByText(emptyTitle)).toBeDefined()
      expect(screen.queryByText('Похоже, это не адрес почты.')).toBeNull()
    })

    it('takes back an address the server rejects and says why under the field, never the raw message', async () => {
      getMe.mockResolvedValue(me)
      // Over the cap: the one rule the browser's own check does not count, so it is the server that says no.
      const tooLong = `${'a'.repeat(250)}@mems.fun`
      updateEmail.mockRejectedValue(new ApiError(400, 'invalid_email', 'Invalid email: must be at most 254 bytes'))

      await save(tooLong)

      const field = await screen.findByLabelText<HTMLInputElement>('Почта')
      expect(field.value).toBe(tooLong)
      expect(field).toHaveProperty('ariaInvalid', 'true')
      expect(screen.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeDefined()
      expect(screen.queryByText(/must contain/)).toBeNull()
      // The optimistic address is gone with the failed action; the loader was not asked again.
      expect(screen.queryByText(unverified)).toBeNull()
      expect(getMe).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveProperty('disabled', false)
    })

    it('keeps the form with its own words when the request fails for another reason', async () => {
      getMe.mockResolvedValue(me)
      updateEmail.mockRejectedValue(new TypeError('Failed to fetch'))

      await save('ada@mems.fun')

      expect(await screen.findByText(failed)).toBeDefined()
      expect(screen.queryByText('Failed to fetch')).toBeNull()
      expect(screen.getByLabelText<HTMLInputElement>('Почта').value).toBe('ada@mems.fun')
      expect(screen.queryByText(unverified)).toBeNull()
      expect(getMe).toHaveBeenCalledOnce()
    })

    it('brings the address back with its own words when the clear fails', async () => {
      getMe.mockResolvedValue({ ...me, email: address })
      updateEmail.mockRejectedValue(new ApiError(404, 'account_not_found', 'No such account'))
      const user = await openEditor()

      await user.click(screen.getByRole('button', { name: 'Удалить' }))

      expect(await screen.findByText(failed)).toBeDefined()
      expect(screen.getByLabelText<HTMLInputElement>('Почта').value).toBe(address)
      expect(screen.queryByText('No such account')).toBeNull()
      expect(getMe).toHaveBeenCalledOnce()
    })

    it('lands on sign-in when the session ended under the page', async () => {
      getMe.mockResolvedValue(me)
      updateEmail.mockImplementation(async () => {
        getMe.mockRejectedValue(new ApiError(401, 'unauthenticated', 'No live session'))
        throw new ApiError(401, 'unauthenticated', 'No live session')
      })

      await save('ada@mems.fun')

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Вход' })).toBeDefined())
      expect(screen.queryByText(failed)).toBeNull()
    })
  })
})
