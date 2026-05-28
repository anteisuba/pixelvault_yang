'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  /** Section name for context in error display */
  section?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/** Inner FC that can use hooks for i18n */
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

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="size-6 text-destructive/60" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {section ? t('sectionError', { section }) : t('title')}
        </p>
        <p className="text-xs text-muted-foreground font-serif">
          {errorMessage ?? t('description')}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        className="rounded-full text-xs"
      >
        <RotateCcw className="size-3" />
        {t('retry')}
      </Button>
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
