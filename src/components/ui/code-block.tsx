'use client'

import React, { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Check, Copy } from '@/components/icons'
import { cn } from '@/lib/utils'

/** 「已复制」停留多久再换回复制图标。 */
const COPIED_RESET_MS = 1500

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-clip border',
        'border-border bg-card text-card-foreground rounded-xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = 'tsx',
  theme = 'github-light',
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    setHighlightedHtml(null)

    async function highlight() {
      if (!code) {
        if (!isCancelled) {
          setHighlightedHtml('<pre><code></code></pre>')
        }
        return
      }

      const { codeToHtml } = await import('shiki')
      const html = await codeToHtml(code, { lang: language, theme })
      if (!isCancelled) {
        setHighlightedHtml(html)
      }
    }

    void highlight()

    return () => {
      isCancelled = true
    }
  }, [code, language, theme])

  const classNames = cn(
    'w-full overflow-x-auto text-2sm [&>pre]:px-4 [&>pre]:py-4',
    className,
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/**
 * 代码块右上角的复制键（拆分与反推 X2 / X3）。点一下换成「✓ 已复制」1.5 秒；
 * 画出来 24 高，点击区用伪元素扩到 44（手机）。⛔ 不弹 toast。
 */
function CodeBlockCopyButton({ code }: { code: string }) {
  const t = useTranslations('Common')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      data-testid="code-block-copy"
      data-copied={copied ? 'true' : 'false'}
      aria-label={copied ? t('copied') : t('copy')}
      onClick={() => {
        void navigator.clipboard
          .writeText(code)
          .then(() => setCopied(true))
          .catch(() => undefined)
      }}
      className={cn(
        'absolute right-1.5 top-1.5 inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors duration-(--duration-fast) ease-standard before:absolute before:-inset-2.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        copied
          ? 'border-border bg-background text-foreground'
          : 'border-transparent text-muted-foreground',
      )}
    >
      <span
        key={copied ? 'copied' : 'copy'}
        className="inline-flex items-center gap-1 animate-in fade-in-0 animation-duration-(--duration-fast) motion-reduce:animate-none"
      >
        {copied ? (
          <>
            <Check className="size-3.5" aria-hidden />
            {t('copied')}
          </>
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </span>
    </button>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn('flex items-center justify-between', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlockCopyButton, CodeBlock }
