import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { codeToHtml } from 'shiki'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/logger'

import { CodeBlockCode, CodeBlockCopyButton } from './code-block'
import { Markdown } from './markdown'

vi.mock('shiki', async (importOriginal) => {
  const shiki = await importOriginal<typeof import('shiki')>()
  return { ...shiki, codeToHtml: vi.fn(shiki.codeToHtml) }
})

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

describe('CodeBlockCode', () => {
  beforeEach(() => {
    vi.mocked(codeToHtml).mockReset()
    vi.mocked(logger.warn).mockClear()
  })

  it('renders a danbooru fence as plain text without a rejected highlight', async () => {
    vi.mocked(codeToHtml).mockRejectedValueOnce(
      new Error('Language `danbooru` is not included in this bundle.'),
    )
    const code = '1girl, solo,\n<script>alert("tag")</script>\n'
    const { container } = render(
      <Markdown>{`\`\`\`danbooru\n${code}\`\`\``}</Markdown>,
    )

    await act(async () => {
      await vi.dynamicImportSettled()
    })

    expect(container.querySelector('code')?.textContent).toBe(code)
    expect(codeToHtml).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lang: 'danbooru' }),
    )
    expect(container.querySelector('script')).toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it.each(['constructor', '__proto__'])(
    'renders the registry prototype name %s as plain text',
    async (language) => {
      const { container } = render(
        <CodeBlockCode code="1girl, solo" language={language} />,
      )

      await act(async () => {
        await vi.dynamicImportSettled()
      })

      expect(container.querySelector('code')?.textContent).toBe('1girl, solo')
      expect(codeToHtml).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    },
  )

  it.each(['tsx', 'js', 'text', 'txt', 'plaintext', 'plain', 'ansi'])(
    'keeps highlighting for the supported language %s',
    async (language) => {
      const code = 'const value = 1'
      const { container } = render(
        <CodeBlockCode code={code} language={language} />,
      )

      await waitFor(() => {
        expect(container.querySelector('pre')).toHaveClass('shiki')
      })

      expect(container.querySelector('code')?.textContent).toBe(code)
      expect(logger.warn).not.toHaveBeenCalled()
    },
  )

  it('keeps the raw text and reports a failed supported-language highlight', async () => {
    const error = new Error('Unable to load the highlighting engine')
    vi.mocked(codeToHtml).mockRejectedValueOnce(error)
    const code = '<script>alert("tag")</script>\nconst value = 1'
    const { container } = render(<CodeBlockCode code={code} language="tsx" />)

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        'Code block highlighting failed; rendering plain text',
        expect.objectContaining({ language: 'tsx', error }),
      )
    })

    expect(container.querySelector('code')?.textContent).toBe(code)
    expect(container.querySelector('script')).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    'keeps the newest content when an older highlight later %s',
    async (settlement) => {
      const older = Promise.withResolvers<string>()
      const newer = Promise.withResolvers<string>()
      vi.mocked(codeToHtml)
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise)
      const { container, rerender } = render(
        <CodeBlockCode code="old content" language="tsx" />,
      )
      await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1))

      rerender(
        <CodeBlockCode code="new content" language="js" theme="github-dark" />,
      )
      await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(2))

      await act(async () => {
        newer.resolve('<pre class="shiki"><code>new content</code></pre>')
      })
      expect(container.querySelector('pre')).toHaveClass('shiki')
      expect(container.querySelector('code')?.textContent).toBe('new content')

      await act(async () => {
        if (settlement === 'resolve') {
          older.resolve('<pre><code>old content</code></pre>')
        } else {
          older.reject(new Error('Old highlight failed'))
        }
      })

      expect(container.querySelector('pre')).toHaveClass('shiki')
      expect(container.querySelector('code')?.textContent).toBe('new content')
      expect(logger.warn).not.toHaveBeenCalled()
    },
  )
})

describe('CodeBlockCopyButton（拆分与反推 X2 / X3）', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })
  afterEach(() => vi.useRealTimers())

  it('copies the block, shows 已复制 for 1.5s, then goes back', async () => {
    render(<CodeBlockCopyButton code="1girl, solo" />)
    const button = screen.getByTestId('code-block-copy')
    expect(button).toHaveAttribute('aria-label', 'copy')

    await act(async () => {
      fireEvent.click(button)
    })
    expect(writeText).toHaveBeenCalledWith('1girl, solo')
    expect(button).toHaveAttribute('data-copied', 'true')
    expect(button).toHaveTextContent('copied')

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(button).toHaveAttribute('data-copied', 'false')
  })

  it('stays put when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CodeBlockCopyButton code="x" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('code-block-copy'))
    })
    expect(screen.getByTestId('code-block-copy')).toHaveAttribute(
      'data-copied',
      'false',
    )
  })
})
