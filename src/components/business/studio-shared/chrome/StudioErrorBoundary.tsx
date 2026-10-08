'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useErrorRecoveryReveal } from '@/hooks/use-error-recovery-reveal'

interface Props {
  children: ReactNode
  /** Section name for context in error display */
  section?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 出错块（owner 2026-10-08「提示与弹窗」第 3 题 B）：与空态同一个模板，图标角一颗
 * 红点，⛔ 整块不变红。重试是同步的（重置边界），救回来的内容由糊变清。
 */
function ErrorFallback({
  section,
  errorMessage,
  onReset,
}: {
  section?: string
  errorMessage?: string
  onReset: () => void
}) {
  const t = useTranslations('ErrorBoundary')
  const { ref, markRetrying } = useErrorRecoveryReveal<HTMLDivElement>()

  return (
    <div ref={ref}>
      <EmptyState
        tone="error"
        icon={<AlertTriangle />}
        title={section ? t('sectionError', { section }) : t('title')}
        description={errorMessage ?? t('description')}
        action={
          <Button
            size="sm"
            onClick={() => {
              markRetrying()
              onReset()
            }}
            className="rounded-full"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t('retry')}
          </Button>
        }
      />
    </div>
  )
}

/**
 * Component-level error boundary for Studio sub-sections.
 * Catches errors in a section without killing the entire Studio page.
 * The global error.tsx handles page-level errors; this handles section-level.
 */
export class StudioErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          section={this.props.section}
          errorMessage={this.state.error?.message}
          onReset={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}
