import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailCodeAuth } from '@/hooks/use-email-code-auth'
import zh from '@/messages/zh.json'

import { AuthFlow } from './AuthFlow'

const clerkClient = vi.hoisted(() => ({
  lastAuthenticationStrategy: null as string | null,
}))

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ client: clerkClient }),
}))

const flow = vi.hoisted(() => ({ current: null as EmailCodeAuth | null }))

vi.mock('@/hooks/use-email-code-auth', () => ({
  useEmailCodeAuth: () => flow.current,
}))

function makeFlow(overrides: Partial<EmailCodeAuth> = {}): EmailCodeAuth {
  return {
    ready: true,
    step: 'start',
    email: '',
    setEmail: vi.fn(),
    pending: null,
    succeeded: false,
    error: null,
    errorSerial: 0,
    resendIn: 0,
    submitEmail: vi.fn(async () => {}),
    verify: vi.fn(async () => {}),
    resend: vi.fn(async () => {}),
    changeEmail: vi.fn(),
    startSocial: vi.fn(async () => {}),
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderFlow() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <AuthFlow />
    </NextIntlClientProvider>,
  )
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  clerkClient.lastAuthenticationStrategy = null
  flow.current = makeFlow()
})

describe('AuthFlow — 第一步', () => {
  it('offers Google, GitHub, Apple and an email field — and no password', () => {
    const { container } = renderFlow()
    expect(
      screen.getByRole('button', { name: '使用 Google 登录' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '使用 GitHub 登录' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '使用 Apple 登录' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱地址')).toHaveAttribute('type', 'email')
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.textContent).not.toMatch(/密码/)
  })

  it('marks the last-used method with a small pill and a darker row', () => {
    clerkClient.lastAuthenticationStrategy = 'oauth_github'
    renderFlow()
    const github = screen.getByRole('button', { name: /GitHub/ })
    expect(github).toHaveAttribute('data-last-used', 'true')
    expect(github).toHaveTextContent('上次用的')
    expect(screen.getAllByText('上次用的')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Google/ })).not.toHaveAttribute(
      'data-last-used',
    )
  })

  it('marks the email field when the last sign-in was by code', () => {
    clerkClient.lastAuthenticationStrategy = 'email_code'
    const { container } = renderFlow()
    expect(container.querySelector('.auth-field')).toHaveAttribute(
      'data-last-used',
      'true',
    )
  })

  it('clicking a provider starts that provider', () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: '使用 Apple 登录' }))
    expect(flow.current?.startSocial).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'apple', strategy: 'oauth_apple' }),
    )
  })

  it('the key turns into a spinner while sending', () => {
    flow.current = makeFlow({ pending: 'email', email: 'a@b.co' })
    renderFlow()
    const key = screen.getByRole('button', { name: '发送中' })
    expect(key).toHaveAttribute('data-state', 'pending')
    expect(key).toHaveAttribute('aria-busy', 'true')
  })
})

describe('AuthFlow — 验证码那一步', () => {
  it('says where the code went and offers 「换邮箱」', () => {
    flow.current = makeFlow({ step: 'code', email: 'a@b.co', resendIn: 42 })
    const { container } = renderFlow()
    const sent = container.querySelector('.auth-code-sent')
    expect(sent).toHaveTextContent('验证码已发到 a@b.co')
    expect(sent?.querySelector('b')).toHaveTextContent('a@b.co')
    fireEvent.click(screen.getByRole('button', { name: '换邮箱' }))
    expect(flow.current?.changeEmail).toHaveBeenCalled()
  })

  it('counts the resend down with rolling digits, then offers 「重新发送」', () => {
    flow.current = makeFlow({ step: 'code', email: 'a@b.co', resendIn: 42 })
    const { container, unmount } = renderFlow()
    expect(container.querySelector('.auth-resend')).toHaveTextContent(
      /秒后可重新发送/,
    )
    expect(container.querySelector('.auth-resend .number-roll')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '重新发送' })).toBeNull()
    unmount()

    flow.current = makeFlow({ step: 'code', email: 'a@b.co', resendIn: 0 })
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: '重新发送' }))
    expect(flow.current?.resend).toHaveBeenCalled()
  })

  it('the row under the boxes turns into 验证中, then ✓ 已登录', () => {
    flow.current = makeFlow({ step: 'code', email: 'a@b.co', pending: 'code' })
    const { container, unmount } = renderFlow()
    expect(container.querySelector('.auth-resend')).toHaveTextContent('验证中')
    screen.getAllByRole('textbox').forEach((box) => expect(box).toBeDisabled())
    unmount()

    flow.current = makeFlow({ step: 'code', email: 'a@b.co', succeeded: true })
    const done = renderFlow()
    expect(done.container.querySelector('.auth-resend')).toHaveTextContent(
      '已登录',
    )
  })

  it('there is no separate verify key: a full code submits itself', () => {
    flow.current = makeFlow({ step: 'code', email: 'a@b.co' })
    renderFlow()
    expect(screen.queryByRole('button', { name: /验证/ })).toBeNull()
  })

  it('a wrong code shows one red-dot line under the boxes', () => {
    flow.current = makeFlow({
      step: 'code',
      email: 'a@b.co',
      error: 'codeIncorrect',
      errorSerial: 1,
    })
    const { container } = renderFlow()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('验证码不对，再试一次')
    expect(alert.querySelector('.auth-error-dot')).not.toBeNull()
    expect(container.querySelector('.auth-code')).toHaveAttribute(
      'data-invalid',
      'true',
    )
  })

  it('a pasted code is verified straight away', () => {
    flow.current = makeFlow({ step: 'code', email: 'a@b.co' })
    renderFlow()
    fireEvent.paste(screen.getAllByRole('textbox')[0], {
      clipboardData: { getData: () => '123456' },
    })
    expect(flow.current?.verify).toHaveBeenCalledWith('123456')
  })
})
