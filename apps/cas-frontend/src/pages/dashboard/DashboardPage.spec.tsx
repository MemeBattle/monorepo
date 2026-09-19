import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { DashboardPage } from './DashboardPage'
import { loadDashboard } from './loadDashboard'

const { getMe, logout, listPasskeys, renamePasskey, deletePasskey } = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  listPasskeys: vi.fn(),
  renamePasskey: vi.fn(),
  deletePasskey: vi.fn(),
}))
vi.mock('#entities/session', () => ({ getMe, logout }))
vi.mock('#entities/passkey', () => ({ listPasskeys, renamePasskey, deletePasskey }))

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
    listPasskeys.mockReset()
    renamePasskey.mockReset()
    deletePasskey.mockReset()
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
})
