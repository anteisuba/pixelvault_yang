'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="size-6 text-destructive/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {this.props.section
                ? `${this.props.section} encountered an error`
                : 'Something went wrong'}
            </p>
            <p className="text-xs text-muted-foreground font-serif">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="rounded-full text-xs"
          >
            <RotateCcw className="size-3" />
            Retry
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
