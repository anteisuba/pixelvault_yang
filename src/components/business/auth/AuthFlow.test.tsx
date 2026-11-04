import { act, fireEvent, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithApp } from '@/test/app-harness'

import { AuthFlow } from './AuthFlow'

// ─── 边界：Clerk（登录服务）与 Next 路由 ───────────────────────────
// 真 `useEmailCodeAuth` 跑在中间，界面上每一步都是它真走出来的。

class FakeClerkError extends Error {
  errors: Array<{ code: string }>
  constructor(code: string) {
    super(code)
    this.errors = [{ code }]
  }
}

const clerk = vi.hoisted(() => ({
  lastAuthenticationStrategy: null as string | null,
  signIn: {
    create: vi.fn(),
    prepareFirstFactor: vi.fn(),
    attemptFirstFactor: vi.fn(),
    authenticateWithRedirect: vi.fn(),
  },
  signUp: {
    create: vi.fn(),
    prepareEmailAddressVerification: vi.fn(),
    attemptEmailAddressVerification: vi.fn(),
  },
  setActive: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    client: { lastAuthenticationStrategy: clerk.lastAuthenticationStrategy },
    buildAfterSignInUrl: () => '/zh/studio/image',
    buildAfterSignUpUrl: () => '/zh/studio/image',
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: clerk.signIn,
    setActive: clerk.setActive,
  }),
  useSignUp: () => ({ isLoaded: true, signUp: clerk.signUp }),
}))
vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: (err: unknown) => err instanceof FakeClerkError,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
}))

/** 一个由用例决定什么时候兑现的 Promise（看「转圈中」那一刻）。 */
function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderFlow() {
  return renderWithApp(<AuthFlow />)
}

/** 第一步写邮箱、按「继续」，走到验证码那一步。 */
async function toCodeStep(email = 'a@b.co') {
  const view = renderFlow()
  fireEvent.change(screen.getByLabelText('邮箱地址'), {
    target: { value: email },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
  })
  return view
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  clerk.lastAuthenticationStrategy = null
  clerk.signIn.create.mockResolvedValue({
    supportedFirstFactors: [
      { strategy: 'email_code', emailAddressId: 'idn_1' },
    ],
  })
  clerk.signIn.prepareFirstFactor.mockResolvedValue({})
  clerk.signIn.authenticateWithRedirect.mockResolvedValue(undefined)
  clerk.setActive.mockResolvedValue(undefined)
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
    clerk.lastAuthenticationStrategy = 'oauth_github'
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
    clerk.lastAuthenticationStrategy = 'email_code'
    const { container } = renderFlow()
    expect(container.querySelector('.auth-field')).toHaveAttribute(
      'data-last-used',
      'true',
    )
  })

  it('clicking a provider starts that provider', async () => {
    renderFlow()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '使用 Apple 登录' }))
    })
    expect(clerk.signIn.authenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'oauth_apple' }),
    )
  })

  it('the key turns into a spinner while sending', async () => {
    const sending = deferred()
    clerk.signIn.create.mockReturnValue(sending.promise)
    renderFlow()
    fireEvent.change(screen.getByLabelText('邮箱地址'), {
      target: { value: 'a@b.co' },
    })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    const key = screen.getByRole('button', { name: '发送中' })
    expect(key).toHaveAttribute('data-state', 'pending')
    expect(key).toHaveAttribute('aria-busy', 'true')
    await act(async () => sending.resolve({ supportedFirstFactors: [] }))
  })
})

describe('AuthFlow — 验证码那一步', () => {
  it('says where the code went and offers 「换邮箱」', async () => {
    const { container } = await toCodeStep('a@b.co')
    const sent = container.querySelector('.auth-code-sent')
    expect(sent).toHaveTextContent('验证码已发到 a@b.co')
    expect(sent?.querySelector('b')).toHaveTextContent('a@b.co')

    fireEvent.click(screen.getByRole('button', { name: '换邮箱' }))
    // 回到第一步，邮箱留在框里。
    expect(await screen.findByLabelText('邮箱地址')).toHaveValue('a@b.co')
  })

  it('counts the resend down with rolling digits, then offers 「重新发送」', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { container } = await toCodeStep()
      expect(container.querySelector('.auth-resend')).toHaveTextContent(
        /秒后可重新发送/,
      )
      expect(
        container.querySelector('.auth-resend .number-roll'),
      ).not.toBeNull()
      expect(screen.queryByRole('button', { name: '重新发送' })).toBeNull()

      // 冷却走完（一秒一格）。
      for (let i = 0; i < 120; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000)
        })
        if (screen.queryByRole('button', { name: '重新发送' })) break
      }
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '重新发送' }))
      })
      // 第一次发码 + 重发一次。
      expect(clerk.signIn.prepareFirstFactor).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the row under the boxes turns into 验证中, then ✓ 已登录', async () => {
    const verifying = deferred<{ status: string; createdSessionId: string }>()
    clerk.signIn.attemptFirstFactor.mockReturnValue(verifying.promise)
    const { container } = await toCodeStep()

    fireEvent.paste(screen.getAllByRole('textbox')[0]!, {
      clipboardData: { getData: () => '123456' },
    })
    expect(container.querySelector('.auth-resend')).toHaveTextContent('验证中')
    screen.getAllByRole('textbox').forEach((box) => expect(box).toBeDisabled())

    await act(async () =>
      verifying.resolve({ status: 'complete', createdSessionId: 'sess_1' }),
    )
    expect(container.querySelector('.auth-resend')).toHaveTextContent('已登录')
    expect(clerk.setActive).toHaveBeenCalledWith({ session: 'sess_1' })
  })

  it('there is no separate verify key: a full code submits itself', async () => {
    await toCodeStep()
    expect(screen.queryByRole('button', { name: /验证/ })).toBeNull()
  })

  it('a wrong code shows one red-dot line under the boxes', async () => {
    clerk.signIn.attemptFirstFactor.mockRejectedValue(
      new FakeClerkError('form_code_incorrect'),
    )
    const { container } = await toCodeStep()
    await act(async () => {
      fireEvent.paste(screen.getAllByRole('textbox')[0]!, {
        clipboardData: { getData: () => '000000' },
      })
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('验证码不对，再试一次')
    expect(alert.querySelector('.auth-error-dot')).not.toBeNull()
    expect(container.querySelector('.auth-code')).toHaveAttribute(
      'data-invalid',
      'true',
    )
  })

  it('a pasted code is verified straight away', async () => {
    clerk.signIn.attemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_1',
    })
    await toCodeStep()
    await act(async () => {
      fireEvent.paste(screen.getAllByRole('textbox')[0]!, {
        clipboardData: { getData: () => '123456' },
      })
    })
    expect(clerk.signIn.attemptFirstFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      code: '123456',
    })
  })
})
