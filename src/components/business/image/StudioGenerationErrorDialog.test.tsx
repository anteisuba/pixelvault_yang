import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const TRANSLATIONS: Record<string, string> = {
  'generationError.title': 'Generation Failed',
  'generationError.retry': 'Retry',
  'generationError.switchModel': 'Switch Model',
  'generationError.configureKey': 'Set up API key',
  'generationError.editPrompt': 'Edit prompt',
  'generationError.viewDetails': 'View Details',
  // 只列这三条：**故意不全**，好让「码没有文案」这条路在测试里真的走得到。
  'generation.provider_timeout': 'The provider timed out.',
  'generation.content_filtered': 'The prompt was filtered.',
  'generation.unknown': 'An unexpected error occurred',
}

// ⚠ `has` 必须跟着 `t` 一起 mock，且判据要与真实行为一致（查不到就是 false）——
// 真的 next-intl 查不到 key 时**把 key 路径当文案渲染**，组件那道 `has` 守卫正是
// 拦这个的。mock 成「永远 true」等于把守卫测没了。
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => TRANSLATIONS[key] ?? key, {
      has: (key: string) => key in TRANSLATIONS,
    }),
}))

import { StudioGenerationErrorDialog } from './StudioGenerationErrorDialog'

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  error: { message: 'AI provider timed out. Please try again.' },
  onRetry: vi.fn(),
  onSwitchModel: vi.fn(),
}

describe('StudioGenerationErrorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title and reason when open', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    expect(screen.getByText('Generation Failed')).toBeInTheDocument()
    expect(screen.getByText('The provider timed out.')).toBeInTheDocument()
  })

  it('calls onRetry and closes on retry button click', () => {
    const onRetry = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        onRetry={onRetry}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onRetry).toHaveBeenCalled()
  })

  it('calls onSwitchModel and closes on switch model button click', () => {
    const onSwitchModel = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        onSwitchModel={onSwitchModel}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Switch Model' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSwitchModel).toHaveBeenCalled()
  })

  it('expands error details on view details click', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    const detailsButton = screen.getByRole('button', { name: 'View Details' })
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(detailsButton)

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('AI provider timed out. Please try again.'),
    ).toBeInTheDocument()
  })

  it('uses explicit error code when provided', () => {
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Something went wrong', code: 'content_filtered' }}
      />,
    )

    expect(screen.getByText('The prompt was filtered.')).toBeInTheDocument()
  })

  it('uses configure key as the primary action for invalid API keys when wired', () => {
    const onConfigureKey = vi.fn()
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Invalid API key', code: 'invalid_api_key' }}
        onConfigureKey={onConfigureKey}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set up API key' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfigureKey).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('uses edit prompt as the primary action for content filtered errors when wired', () => {
    const onEditPrompt = vi.fn()
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{
          message: 'Safety filter blocked it',
          code: 'content_filtered',
        }}
        onEditPrompt={onEditPrompt}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }))

    expect(onEditPrompt).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('keeps retry as the primary action for provider timeouts', () => {
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Provider timed out', code: 'provider_timeout' }}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('falls back invalid API key primary action to switch model when configure key is not wired', () => {
    const onSwitchModel = vi.fn()
    const onRetry = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Invalid API key', code: 'invalid_api_key' }}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Set up API key' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Switch Model' }),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Switch Model' }))

    expect(onSwitchModel).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
  })

  // 2026-08-22 真机：本地执行 worker 没起，弹窗上原样写着
  // 「Errors.generation.execution_worker_unavailable」。next-intl 查不到 key 时
  // 把 key 路径当文案渲染 —— 漏一条翻译的表现是一行乱码摆在用户面前。
  it('码没有对应文案时兜到「未知错误」，⛔ 绝不把 key 路径当文案显示', () => {
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{
          message: 'dispatch failed',
          code: 'execution_worker_unavailable',
        }}
      />,
    )

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    expect(
      screen.queryByText(/generation\.execution_worker_unavailable/),
    ).not.toBeInTheDocument()
  })

  it('⚠ 防空转：文案齐全时走的是文案本身，不是兜底', () => {
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'x', code: 'provider_timeout' }}
      />,
    )

    expect(screen.getByText('The provider timed out.')).toBeInTheDocument()
    expect(
      screen.queryByText('An unexpected error occurred'),
    ).not.toBeInTheDocument()
  })
})
