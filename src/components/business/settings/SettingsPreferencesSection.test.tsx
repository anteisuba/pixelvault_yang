import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsPreferencesSection } from './SettingsPreferencesSection'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@/components/layout/LocaleSwitcher', () => ({
  LocaleSwitcher: () => <nav aria-label="locale" />,
}))

vi.mock('@/hooks/use-local-preference', () => ({
  useLocalPreference: () => [null, vi.fn()],
}))

const profile = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { displayName: 'antei' },
    refresh: profile.refresh,
  }),
}))

const api = vi.hoisted(() => ({ updateProfileAPI: vi.fn() }))
vi.mock('@/lib/api-client', () => api)

const toast = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('@/lib/toast', () => toast)

beforeEach(() => {
  vi.clearAllMocks()
})

function nameField() {
  return screen.getByRole('textbox', {
    name: 'Settings:preferences.displayName',
  })
}

describe('SettingsPreferencesSection · 显示名', () => {
  it('saves on blur and flashes 已保存 at the field edge instead of a toast', async () => {
    api.updateProfileAPI.mockResolvedValue({ success: true, data: {} })
    render(<SettingsPreferencesSection />)
    fireEvent.change(nameField(), { target: { value: '  小黑 ' } })
    fireEvent.blur(nameField())

    expect(api.updateProfileAPI).toHaveBeenCalledWith({ displayName: '小黑' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Settings:preferences.saved',
    )
    expect(screen.getByTestId('display-name-mark')).toHaveTextContent(
      'Settings:preferences.saved',
    )
    expect(toast.toastError).not.toHaveBeenCalled()
  })

  it('shows the spinner while saving and keeps the field locked', async () => {
    let resolve: (value: unknown) => void = () => {}
    api.updateProfileAPI.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(<SettingsPreferencesSection />)
    fireEvent.change(nameField(), { target: { value: '小黑' } })
    fireEvent.blur(nameField())
    expect(nameField()).toBeDisabled()
    expect(screen.getByText('Settings:preferences.saving')).toBeInTheDocument()
    resolve({ success: true, data: {} })
    await waitFor(() => expect(nameField()).not.toBeDisabled())
  })

  it('does nothing when the name did not change', () => {
    render(<SettingsPreferencesSection />)
    fireEvent.blur(nameField())
    expect(api.updateProfileAPI).not.toHaveBeenCalled()
  })

  it('reports a failure on the bottom bar', async () => {
    api.updateProfileAPI.mockResolvedValue({ success: false, error: 'nope' })
    render(<SettingsPreferencesSection />)
    fireEvent.change(nameField(), { target: { value: '小黑' } })
    fireEvent.blur(nameField())
    await waitFor(() => expect(toast.toastError).toHaveBeenCalledWith('nope'))
    expect(screen.getByTestId('display-name-mark')).toHaveTextContent('')
  })
})
