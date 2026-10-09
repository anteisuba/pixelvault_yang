import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsDeleteAccountRow } from './SettingsDeleteAccountRow'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

const clerk = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: { delete: clerk.deleteUser } }),
  useClerk: () => ({ signOut: clerk.signOut }),
}))

const PHRASE = 'Settings.deleteAccount:phrase'

beforeEach(() => {
  vi.clearAllMocks()
})

function openAndConfirm() {
  render(<SettingsDeleteAccountRow />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Settings.deleteAccount:trigger' }),
  )
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveTextContent('Settings.deleteAccount:description')
  const confirm = Array.from(dialog.querySelectorAll('button')).find(
    (button) => button.textContent === 'Settings.deleteAccount:confirm',
  )
  expect(confirm).toBeDisabled()
  fireEvent.change(
    screen.getByLabelText('Settings.deleteAccount:phraseLabel'),
    {
      target: { value: PHRASE },
    },
  )
  expect(confirm).toBeEnabled()
  fireEvent.click(confirm!)
}

describe('SettingsDeleteAccountRow · 注销账号', () => {
  it('deletes the Clerk user only after the phrase is typed, then signs out to home', async () => {
    clerk.deleteUser.mockResolvedValue(undefined)
    clerk.signOut.mockResolvedValue(undefined)
    openAndConfirm()

    await waitFor(() => expect(clerk.deleteUser).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: '/' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the progress on the key while deleting', async () => {
    clerk.deleteUser.mockReturnValue(new Promise(() => {}))
    openAndConfirm()

    expect(
      await screen.findByRole('button', {
        name: 'Settings.deleteAccount:deleting',
      }),
    ).toHaveAttribute('data-feedback', 'progress')
  })

  it('keeps the user signed in and says so inline when Clerk refuses', async () => {
    clerk.deleteUser.mockRejectedValue(new Error('reverification required'))
    openAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Settings.deleteAccount:failed',
    )
    expect(clerk.signOut).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Settings.deleteAccount:trigger' }),
    ).toBeEnabled()
  })
})
