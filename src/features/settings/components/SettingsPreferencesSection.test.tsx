/**
 * L2b：偏好区的显示名连真 `useMyProfile`（真查询缓存）、真 api-client，只假网络
 * （`/api/users/me/profile`）。断言发出去的 PUT 内容与界面上那句字。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import { SettingsPreferencesSection } from './SettingsPreferencesSection'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user_1', isSignedIn: true, isLoaded: true }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/settings/preferences',
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

const PROFILE = {
  id: 'db_1',
  username: 'antei',
  displayName: 'antei',
  avatarUrl: null,
  bio: null,
  isPublic: true,
}

type Put =
  | { status: number; body: unknown }
  | Promise<{ status: number; body: unknown }>

function profileServer(put?: () => Put) {
  const puts: unknown[] = []
  fakeServer()
    .on('GET', '/api/users/me/profile', () =>
      Response.json({ success: true, data: PROFILE }),
    )
    .on('PUT', '/api/users/me/profile', async (request) => {
      puts.push(await request.json())
      const reply = await (put?.() ?? {
        status: 200,
        body: { success: true, data: PROFILE },
      })
      return Response.json(reply.body, { status: reply.status })
    })
  return puts
}

beforeEach(() => {
  toastError.mockReset()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** jsdom 没有 `Notification`：按需装一个只会回答权限的假的。 */
function stubNotification(answer: NotificationPermission) {
  const requestPermission = vi.fn(async () => answer)
  vi.stubGlobal(
    'Notification',
    Object.assign(function Notification() {}, {
      permission: 'default' as NotificationPermission,
      requestPermission,
    }),
  )
  return requestPermission
}

const NOTIFY_KEY = 'pixelvault:settings:notify-on-complete'

describe('SettingsPreferencesSection · 生成完成时通知', () => {
  it('浏览器不支持通知 → 整行不出', () => {
    profileServer()
    renderWithApp(<SettingsPreferencesSection />)
    expect(
      screen.queryByRole('switch', {
        name: message('Settings.preferences.notifyOnComplete'),
      }),
    ).toBeNull()
  })

  it('打开那一刻请求权限；允许 → 保持开', async () => {
    const requestPermission = stubNotification('granted')
    profileServer()
    renderWithApp(<SettingsPreferencesSection />)

    const toggle = await screen.findByRole('switch', {
      name: message('Settings.preferences.notifyOnComplete'),
    })
    expect(requestPermission).not.toHaveBeenCalled()
    fireEvent.click(toggle)

    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(localStorage.getItem(NOTIFY_KEY)).toBe('1')
  })

  it('被拒 → 开关弹回关，并说一句为什么', async () => {
    stubNotification('denied')
    profileServer()
    renderWithApp(<SettingsPreferencesSection />)

    const toggle = await screen.findByRole('switch', {
      name: message('Settings.preferences.notifyOnComplete'),
    })
    fireEvent.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      message('Settings.preferences.notifyDenied'),
    )
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem(NOTIFY_KEY)).toBe('0')
  })
})

describe('SettingsPreferencesSection · 行', () => {
  it('「默认打开」已删：没有下拉，只剩开关', () => {
    profileServer()
    renderWithApp(<SettingsPreferencesSection />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(
      screen.getByRole('switch', {
        name: message('Settings.preferences.reduceMotion'),
      }),
    ).toBeInTheDocument()
  })
})

async function nameField() {
  const field = screen.getByRole('textbox', {
    name: message('Settings.preferences.displayName'),
  })
  await waitFor(() => expect(field).toHaveValue('antei'))
  return field
}

describe('SettingsPreferencesSection · 显示名', () => {
  it('失焦就存（去掉首尾空格），在字段边上闪「已保存」，不弹 toast', async () => {
    const puts = profileServer()
    renderWithApp(<SettingsPreferencesSection />)

    const field = await nameField()
    fireEvent.change(field, { target: { value: '  小黑 ' } })
    fireEvent.blur(field)

    expect(await screen.findByRole('status')).toHaveTextContent(
      message('Settings.preferences.saved'),
    )
    expect(puts).toEqual([{ displayName: '小黑' }])
    expect(screen.getByTestId('display-name-mark')).toHaveTextContent(
      message('Settings.preferences.saved'),
    )
    expect(toastError).not.toHaveBeenCalled()
  })

  it('存的时候转圈、字段锁住，回来就解锁', async () => {
    let release: (value: { status: number; body: unknown }) => void = () => {}
    const pending = new Promise<{ status: number; body: unknown }>((done) => {
      release = done
    })
    profileServer(() => pending)
    renderWithApp(<SettingsPreferencesSection />)

    const field = await nameField()
    fireEvent.change(field, { target: { value: '小黑' } })
    fireEvent.blur(field)
    expect(field).toBeDisabled()
    expect(
      screen.getByText(message('Settings.preferences.saving')),
    ).toBeInTheDocument()

    release({ status: 200, body: { success: true, data: PROFILE } })
    await waitFor(() => expect(field).not.toBeDisabled())
  })

  it('名字没改就不发请求', async () => {
    const puts = profileServer()
    renderWithApp(<SettingsPreferencesSection />)
    fireEvent.blur(await nameField())
    expect(puts).toEqual([])
  })

  it('存失败在底部条报一句（本地化的那句），字段边不闪', async () => {
    profileServer(() => ({
      status: 500,
      body: { success: false, error: 'nope' },
    }))
    renderWithApp(<SettingsPreferencesSection />)

    const field = await nameField()
    fireEvent.change(field, { target: { value: '小黑' } })
    fireEvent.blur(field)

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0]![0]).toBe(
      message('Settings.preferences.displayNameFailed'),
    )
    expect(screen.getByTestId('display-name-mark')).toHaveTextContent('')
  })
})
